import type { Condition, OptimisticClaim, Verdict } from "@potted/core";

/** Everything an adapter needs from the outside world, so tests can fake it. */
export interface Deps {
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
}

export interface CheckContext {
  /** When pledging closed and the attempt began (ms). Earlier play is ignored. */
  lockedAt: number;
  /** The attempt must finish by this time (ms). */
  deadline: number;
  now: number;
  /** Whatever the adapter's snapshot() returned at lock. */
  baseline?: unknown;
  claim?: OptimisticClaim;
}

export interface Adapter<C extends Condition = Condition> {
  kind: C["kind"];
  /**
   * Optional reading taken when the challenge locks, for games whose API
   * only exposes running totals.
   */
  snapshot?(condition: C, deps: Deps): Promise<unknown>;
  /** Must be safe to call repeatedly; returns "pending" until decided. */
  check(condition: C, ctx: CheckContext, deps: Deps): Promise<Verdict>;
}

export class VerifierError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "VerifierError";
  }
}

export const pending = (reason: string): Verdict => ({ outcome: "pending", reason });
