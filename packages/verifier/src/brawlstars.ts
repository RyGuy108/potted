import type { BrawlStarsCondition, Verdict } from "@potted/core";
import { type Adapter, type CheckContext, type Deps, VerifierError, pending } from "./types";

export interface BrawlBattle {
  /** Compact ISO form, e.g. "20261116T150402.000Z". */
  battleTime: string;
  event?: { mode?: string; map?: string };
  battle: {
    mode?: string;
    type?: string;
    result?: "victory" | "defeat" | "draw";
    /** Showdown modes report a finishing rank in place of a result. */
    rank?: number;
  };
}

export function parseBattleTime(value: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.(\d{3})Z$/.exec(value);
  if (!m) throw new VerifierError(`Unrecognized battle time: ${value}`);
  return Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7]}Z`);
}

/** Top 4 solo or top 2 duo is how the game itself awards a Showdown win. */
export function isWin(b: BrawlBattle): boolean {
  if (b.battle.result) return b.battle.result === "victory";
  if (b.battle.rank != null) {
    const duo = (b.battle.mode ?? b.event?.mode ?? "").toLowerCase().includes("duo");
    return b.battle.rank <= (duo ? 2 : 4);
  }
  return false;
}

async function fetchBattles(c: BrawlStarsCondition, deps: Deps): Promise<BrawlBattle[]> {
  const key = deps.env.BRAWLSTARS_API_KEY;
  if (!key) throw new VerifierError("BRAWLSTARS_API_KEY is not set");
  const base = (deps.env.BRAWLSTARS_API_BASE ?? "https://api.brawlstars.com/v1").replace(/\/$/, "");
  const res = await deps.fetch(`${base}/players/%23${c.playerTag}/battlelog`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  if (res.status === 403) {
    throw new VerifierError("Brawl Stars rejected the key. Keys are tied to an IP address.", 403);
  }
  if (res.status === 404) throw new VerifierError(`Player #${c.playerTag} not found`, 404);
  if (!res.ok) throw new VerifierError(`Brawl Stars returned ${res.status}`, res.status);
  const body = (await res.json()) as { items?: BrawlBattle[] };
  return body.items ?? [];
}

/**
 * "Win N of your next M battles." Friendly battles are ignored because they
 * can be arranged. The battle log only keeps about 25 battles, so the
 * verifier has to check during the attempt, not long after it.
 */
export const brawlStarsAdapter: Adapter<BrawlStarsCondition> = {
  kind: "brawlstars",
  async check(c, ctx: CheckContext, deps): Promise<Verdict> {
    const counted = (await fetchBattles(c, deps))
      .map((b) => ({ b, at: parseBattleTime(b.battleTime) }))
      .filter(({ b, at }) => at >= ctx.lockedAt && at <= ctx.deadline && b.battle.type !== "friendly")
      .sort((x, y) => x.at - y.at)
      .slice(0, c.battles);

    const wins = counted.filter(({ b }) => isWin(b)).length;
    const played = counted.length;
    const evidence =
      played > 0
        ? {
            source: "brawlstars",
            ref: `${c.playerTag}:${counted[0]!.b.battleTime}..${counted[played - 1]!.b.battleTime}`,
            summary: `#${c.playerTag} won ${wins} of ${played} counted battles (needed ${c.wins} of ${c.battles}). Friendly battles are not counted.`,
          }
        : undefined;

    if (wins >= c.wins) {
      return { outcome: "success", reason: `Won ${wins} of ${played} battles`, evidence };
    }
    if (wins + (c.battles - played) < c.wins) {
      return { outcome: "failure", reason: `Only ${wins} wins after ${played} battles`, evidence };
    }
    if (ctx.now > ctx.deadline) {
      return { outcome: "failure", reason: `Deadline passed with ${wins} of ${c.wins} wins`, evidence };
    }
    return pending(`${wins} of ${c.wins} wins so far, ${c.battles - played} battles left`);
  },
};
