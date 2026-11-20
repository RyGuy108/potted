import fs from "node:fs";
import path from "node:path";
import { type Db, type User, dataDir, db, replaceDb, save } from "./store";

/**
 * One-time clean slates for the live server. Each id runs once: it saves a
 * full copy of the state to backups/, then removes every account and
 * everything that belongs to accounts (challenges, pledges, gifts, notices
 * and the rest). What survives: the cookie secret, cause wallets and the
 * list of purges already run. Custodial wallet keys (wallets.json) are not
 * touched, so no devnet funds are stranded.
 *
 * Runs only on Railway production (see onRailwayProduction) unless forced,
 * and POTTED_PURGE=off skips it.
 */
export const PURGES = ["2026-11-19-remove-beta-accounts"] as const;

/**
 * One-time removals of single accounts on the live server, by id. Each runs
 * once, after a backup, and removes the account with its challenges and
 * everything tied to it. An account whose challenges hold other people's
 * pledges is left alone (that money would be stranded) and logged.
 */
export const ACCOUNT_REMOVALS: { id: string; matches: (u: User) => boolean }[] = [
  {
    // Ryan's Twitch sign-in, removed so his Twitch channel can go on the demo climber Moss.
    id: "2026-11-20-remove-psychedterror",
    matches: (u) =>
      [u.name, u.handle, u.settings?.twitchChannel].some((v) => v?.toLowerCase() === "psychedterror") &&
      !u.id.includes("_s_"),
  },
];

export interface PurgeResult {
  id: string;
  backup: string | null;
  removedUsers: { id: string; name: string; email?: string; providers: string[] }[];
  removedChallenges: number;
  removedPledges: number;
}

/** The empty state a purge leaves, keeping what is not about accounts. */
export function cleanSlate(before: Db, purgeId: string): Db {
  return {
    users: [],
    challenges: [],
    pledges: [],
    suggestions: [],
    bounties: [],
    causeWallets: before.causeWallets ?? {},
    backings: [],
    chain: [],
    causeReceipts: [],
    badgeMints: {},
    invites: [],
    events: [],
    balances: {},
    seq: before.seq ?? 0,
    ...(before.secret ? { secret: before.secret } : {}),
    purges: [...(before.purges ?? []), purgeId],
  };
}

function writeBackup(state: Db, id: string): string {
  const dir = path.join(dataDir(), "backups");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `pre-purge-${id}.json`);
  fs.writeFileSync(file, JSON.stringify(state));
  fs.chmodSync(file, 0o600);
  return file;
}

/** Removes these accounts and their challenges, pledges, notices and the rest. */
export function removeAccounts(state: Db, ids: Set<string>): { challenges: number; pledges: number } {
  const challenges = new Set(state.challenges.filter((c) => ids.has(c.streamerId)).map((c) => c.id));
  const pledgesBefore = state.pledges.length;
  state.users = state.users.filter((u) => !ids.has(u.id));
  state.challenges = state.challenges.filter((c) => !challenges.has(c.id));
  state.pledges = state.pledges.filter((p) => !challenges.has(p.challengeId) && !ids.has(p.userId));
  state.suggestions = state.suggestions.filter((s) => !ids.has(s.streamerId) && !ids.has(s.userId));
  const bounties = new Set(state.bounties.filter((b) => ids.has(b.creatorId) || ids.has(b.streamerId)).map((b) => b.id));
  state.bounties = state.bounties.filter((b) => !bounties.has(b.id));
  state.backings = state.backings.filter((k) => !bounties.has(k.bountyId) && !ids.has(k.userId));
  state.invites = state.invites.filter((i) => !ids.has(i.hostId) && !ids.has(i.guestId));
  state.events = state.events.filter((e) => !challenges.has(e.challengeId));
  if (state.campaigns) state.campaigns = state.campaigns.filter((c) => !ids.has(c.streamerId));
  if (state.follows) state.follows = state.follows.filter((f) => !ids.has(f.fanId) && !ids.has(f.streamerId));
  if (state.notices) state.notices = state.notices.filter((n) => !ids.has(n.userId) && !challenges.has(n.href.replace("/c/", "")));
  if (state.redemptions) state.redemptions = state.redemptions.filter((r) => !ids.has(r.userId) && !ids.has(r.streamerId));
  if (state.gifts) state.gifts = state.gifts.filter((g) => !ids.has(g.fanId) && !ids.has(g.streamerId));
  for (const id of ids) {
    delete state.points?.[id];
    delete state.scouts?.[id];
    delete state.liveAnnounced?.[id];
  }
  if (state.sample) state.sample.challengeIds = state.sample.challengeIds.filter((c) => !challenges.has(c));
  return { challenges: challenges.size, pledges: pledgesBefore - state.pledges.length };
}

/** Runs any single-account removal that has not run on this state yet. */
export function runAccountRemovals(opts: { env?: Record<string, string | undefined>; writeBackup?: boolean } = {}): PurgeResult[] {
  const env = opts.env ?? process.env;
  if (env.POTTED_PURGE === "off") return [];
  const results: PurgeResult[] = [];
  for (const removal of ACCOUNT_REMOVALS) {
    const state = db();
    if (state.purges?.includes(removal.id)) continue;
    const targets = state.users.filter(removal.matches);
    const ids = new Set(targets.map((u) => u.id));
    const othersMoney =
      state.pledges.some((p) => !ids.has(p.userId) && state.challenges.some((c) => c.id === p.challengeId && ids.has(c.streamerId))) ||
      state.backings.some((k) => state.bounties.some((b) => b.id === k.bountyId && ids.has(b.streamerId)));
    if (othersMoney) {
      console.error(`[purge] ${removal.id}: skipped, other people have pledged to these accounts' challenges`);
      continue;
    }
    const backup = targets.length && opts.writeBackup !== false ? writeBackup(state, removal.id) : null;
    const removed = removeAccounts(state, ids);
    state.purges = [...(state.purges ?? []), removal.id];
    results.push({
      id: removal.id,
      backup,
      removedUsers: targets.map((u) => ({ id: u.id, name: u.name, ...(u.email ? { email: u.email } : {}), providers: (u.identities ?? []).map((i) => i.provider) })),
      removedChallenges: removed.challenges,
      removedPledges: removed.pledges,
    });
    save();
  }
  return results;
}

/** Runs any purge that has not run on this state yet. Returns what it removed. */
export function runPurges(opts: { env?: Record<string, string | undefined>; now?: Date; writeBackup?: boolean } = {}): PurgeResult[] {
  const env = opts.env ?? process.env;
  if (env.POTTED_PURGE === "off") return [];
  const results: PurgeResult[] = [];
  for (const id of PURGES) {
    const before = db();
    if (before.purges?.includes(id)) continue;
    let backupFile: string | null = null;
    if (opts.writeBackup !== false) {
      const dir = path.join(dataDir(), "backups");
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      backupFile = path.join(dir, `pre-purge-${id}.json`);
      fs.writeFileSync(backupFile, JSON.stringify(before));
      fs.chmodSync(backupFile, 0o600);
      const wallets = path.join(dataDir(), "wallets.json");
      if (fs.existsSync(wallets)) {
        const copy = path.join(dir, `pre-purge-${id}-wallets.json`);
        fs.copyFileSync(wallets, copy);
        fs.chmodSync(copy, 0o600);
      }
    }
    results.push({
      id,
      backup: backupFile,
      removedUsers: before.users.map((u) => ({ id: u.id, name: u.name, ...(u.email ? { email: u.email } : {}), providers: (u.identities ?? []).map((i) => i.provider) })),
      removedChallenges: before.challenges.length,
      removedPledges: before.pledges.length,
    });
    replaceDb(cleanSlate(before, id));
    save();
  }
  return results;
}
