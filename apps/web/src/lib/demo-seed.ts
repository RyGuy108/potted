import { onRailwayProduction } from "./demo-mode";
import { ledger } from "./ledger";
import { addSampleHistory, isSampleId, removeSample } from "./sample-data";
import { writeBackup } from "./purge";
import { addSampleLive, fundSampleWallets } from "./sample-live";
import { type Db, type PointsConfig, type User, db, save } from "./store";

/**
 * The demo seed on a running server: the sample from sample-data.ts (about
 * thirty clearly marked accounts with six weeks of history) plus live pots
 * from sample-live.ts, so browse, stream pages and leaderboards have
 * something in them. Every record it adds has "_s_" in its id and every
 * past settlement is labelled "sample history" on its page.
 *
 * POTTED_DEMO_SEED:
 *   on      load it once, and open a fresh set of live pots whenever the last set has closed
 *   remove  take every sample record back out (real accounts are untouched)
 *   off     do nothing
 * Not set: on for the hosted Railway production server, off elsewhere
 * (locally, use `pnpm --filter @potted/web sample`).
 */
export type SeedMode = "on" | "off" | "remove";

export function demoSeedMode(env: Record<string, string | undefined> = process.env): SeedMode {
  const set = env.POTTED_DEMO_SEED;
  if (set === "on" || set === "off" || set === "remove") return set;
  return onRailwayProduction(env) ? "on" : "off";
}

/** Live pots stay open for a day, the longest a challenge can run. */
const LIVE_MINUTES = 24 * 60;

/** True when the sample is loaded but none of its live pots is still taking pledges. */
export function needsFreshLive(state: Db, now = Date.now()): boolean {
  if (!state.sample) return false;
  const ids = new Set(state.sample.challengeIds);
  return !state.challenges.some((c) => ids.has(c.id) && c.status === "open" && c.deadline > now);
}

/**
 * One-time fresh starts of the demo sample on a running server. Each id runs
 * once (recorded in `demoResets`): it backs the state up, takes the sample
 * out (with everything done to it since, like test pledges), and builds it
 * again with fresh history and live pots. The demo climber's account is
 * kept as it is (name, handle, sign-ins, connected channels, settings and
 * channel points), so links to its stream page and overlay keep working.
 * Every sample account keeps its wallet.
 */
export const DEMO_RESETS = ["2026-11-20-fresh-demo"] as const;

/** The sample account whose own setup survives a reset: the climber demo login. */
export const KEPT_ACCOUNT = "u_s_moss";

export function pendingResets(state: Db): string[] {
  return DEMO_RESETS.filter((id) => !(state.demoResets ?? []).includes(id));
}

/** Rebuilds the sample, keeping the demo climber's account and every sample wallet. Returns the new history's balances to fund. */
export function rebuildSample(state: Db, now = Date.now()): { balances: Record<string, number>; history: ReturnType<typeof addSampleHistory> } {
  const kept = state.users.find((u) => u.id === KEPT_ACCOUNT);
  const keptPoints: PointsConfig | undefined = state.points?.[KEPT_ACCOUNT];
  const wallets = new Map(state.users.filter((u) => isSampleId(u.id) && !u.wallet.startsWith("sim:")).map((u) => [u.id, u.wallet]));
  removeSample(state);
  const history = addSampleHistory(state, now);
  for (const u of state.users) {
    const wallet = wallets.get(u.id);
    if (wallet) u.wallet = wallet;
  }
  if (kept) {
    const fresh = state.users.find((u) => u.id === KEPT_ACCOUNT)!;
    const restored: User = { ...kept, createdAt: Math.min(kept.createdAt, fresh.createdAt) };
    // Past streams and a schedule from the new history, unless the account already shows its own.
    const own = kept.profile;
    const hasOwn = (kind: "schedule" | "history") => (own?.[kind]?.length ?? 0) + (own?.twitch?.[kind]?.length ?? 0) > 0;
    restored.profile = {
      ...fresh.profile,
      ...own,
      schedule: hasOwn("schedule") ? own?.schedule : fresh.profile?.schedule,
      history: hasOwn("history") ? own?.history : fresh.profile?.history,
      bio: own?.bio || fresh.profile?.bio,
    };
    delete restored.awarded;
    state.users[state.users.indexOf(fresh)] = restored;
    if (keptPoints) state.points![KEPT_ACCOUNT] = keptPoints;
  }
  return { balances: history.balances, history };
}

let busy = false;

/** Brings the server in line with POTTED_DEMO_SEED. Safe to call often; does nothing when there is nothing to do. */
export async function ensureDemoSeed(log: (line: string) => void = (line) => console.log(`[demo-seed] ${line}`)): Promise<void> {
  const mode = demoSeedMode();
  if (mode === "off" || busy) return;
  const state = db();
  busy = true;
  try {
    if (mode === "remove") {
      if (!state.sample && !state.users.some((u) => isSampleId(u.id))) return;
      const removed = removeSample(state);
      save();
      log(`removed the demo sample (${removed} accounts, challenges and pledges)`);
      return;
    }
    ledger();
    const resets = state.sample ? pendingResets(state) : [];
    if (resets.length > 0) {
      const backup = writeBackup(state, `demo-reset-${resets.at(-1)}`);
      const { history } = rebuildSample(state);
      state.demoResets = [...(state.demoResets ?? []), ...resets];
      save();
      log(`reset the demo sample (backup at ${backup}): ${history.challenges.length} past challenges, ${history.pledges.length} pledges, ${history.gifts.length} gifts`);
      await fundSampleWallets(history.balances, log);
      await addSampleLive({ minutes: LIVE_MINUTES, log });
      log("opened the live sample pots");
      return;
    }
    if (!state.sample) {
      const history = addSampleHistory(state);
      // A fresh state needs no reset later.
      state.demoResets = [...(state.demoResets ?? []), ...pendingResets(state)];
      save();
      log(`added ${history.users.length} sample accounts, ${history.challenges.length} past challenges, ${history.pledges.length} pledges`);
      await fundSampleWallets(history.balances, log);
      await addSampleLive({ minutes: LIVE_MINUTES, log });
      log("opened the live sample pots");
      return;
    }
    if (needsFreshLive(state)) {
      // The last set closed on its own (and was refunded); it stays as history. Open a fresh set.
      await addSampleLive({ minutes: LIVE_MINUTES, log });
      log("opened a fresh set of live sample pots");
    }
  } catch (err) {
    console.error("[demo-seed] failed:", err instanceof Error ? err.message : err);
  } finally {
    busy = false;
  }
}

/** Checks the seed at start-up and then every few minutes, so live pots reopen after their day runs out. */
export function startDemoSeed(everyMs = 5 * 60_000): void {
  const g = globalThis as { __pottedDemoSeed?: ReturnType<typeof setInterval> };
  if (g.__pottedDemoSeed || demoSeedMode() === "off") return;
  void ensureDemoSeed();
  g.__pottedDemoSeed = setInterval(() => void ensureDemoSeed(), everyMs);
  g.__pottedDemoSeed.unref?.();
}
