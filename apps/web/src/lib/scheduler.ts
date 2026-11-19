import { expireBounties, listStreamers, releaseStaleEvents, tick } from "./service";

/**
 * The background job. Every 20 seconds (POTTED_TICK_MS) it does what used
 * to happen only when someone loaded a page:
 *
 * - refunds challenges whose time ran out with no result,
 * - checks live challenges' results (each game's API at most every 8 seconds per challenge),
 * - expires fan requests that were never taken on,
 * - puts overlay lines on screen that the QuickNode Stream never delivered.
 *
 * Passes never overlap; a slow pass makes the next one wait.
 */

export interface PassReport {
  at: number;
  ms: number;
  streamers: number;
  errors: number;
}

const g = globalThis as { __pottedScheduler?: { timer?: ReturnType<typeof setInterval>; running: boolean; last?: PassReport; lastError?: string } };
const state = (g.__pottedScheduler ??= { running: false });

export async function runPass(now = Date.now()): Promise<PassReport | undefined> {
  if (state.running) return undefined;
  state.running = true;
  const started = Date.now();
  let errors = 0;
  const streamers = listStreamers();
  try {
    await expireBounties().catch(() => errors++);
    for (const streamer of streamers) {
      try {
        await tick(streamer.id);
      } catch (error) {
        errors++;
        state.lastError = error instanceof Error ? error.message : String(error);
      }
    }
    releaseStaleEvents(now);
  } finally {
    state.running = false;
  }
  state.last = { at: started, ms: Date.now() - started, streamers: streamers.length, errors };
  return state.last;
}

export function startScheduler(everyMs = Number(process.env.POTTED_TICK_MS) || 20_000): void {
  if (state.timer || process.env.POTTED_SCHEDULER === "off") return;
  state.timer = setInterval(() => void runPass(), Math.max(5_000, everyMs));
  state.timer.unref?.();
  void runPass();
}

export function schedulerStatus() {
  return { on: Boolean(state.timer), running: state.running, last: state.last ?? null, lastError: state.lastError ?? null };
}
