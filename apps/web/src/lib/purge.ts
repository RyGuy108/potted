import fs from "node:fs";
import path from "node:path";
import { type Db, dataDir, db, replaceDb, save } from "./store";

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
