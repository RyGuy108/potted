import { onRailwayProduction } from "./demo-mode";
import { ledger } from "./ledger";
import { addSampleHistory, isSampleId, removeSample } from "./sample-data";
import { addSampleLive } from "./sample-live";
import { type Db, db, save } from "./store";

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
    if (!state.sample) {
      const history = addSampleHistory(state);
      save();
      log(`added ${history.users.length} sample accounts, ${history.challenges.length} past challenges, ${history.pledges.length} pledges`);
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
