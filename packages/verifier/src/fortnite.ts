import type { FortniteCondition, Verdict } from "@potted/core";
import { type Adapter, type Deps, VerifierError, pending } from "./types";

export interface FortniteTotals {
  accountId: string;
  wins: number;
  kills: number;
  matches: number;
  at: number;
}

async function fetchTotals(c: FortniteCondition, deps: Deps, now: number): Promise<FortniteTotals> {
  const key = deps.env.FORTNITE_API_KEY;
  if (!key) throw new VerifierError("FORTNITE_API_KEY is not set");
  const url = `https://fortnite-api.com/v2/stats/br/v2?name=${encodeURIComponent(c.accountName)}`;
  const res = await deps.fetch(url, { headers: { Authorization: key } });
  if (res.status === 403) {
    throw new VerifierError(`${c.accountName} has private stats. Turn on public stats in Fortnite settings.`, 403);
  }
  if (res.status === 404) throw new VerifierError(`Epic account "${c.accountName}" not found`, 404);
  if (!res.ok) throw new VerifierError(`fortnite-api.com returned ${res.status}`, res.status);
  const body = (await res.json()) as {
    data?: {
      account?: { id?: string };
      stats?: { all?: { overall?: { wins?: number; kills?: number; matches?: number } } };
    };
  };
  const overall = body.data?.stats?.all?.overall;
  if (!overall) throw new VerifierError("fortnite-api.com response had no overall stats");
  return {
    accountId: body.data?.account?.id ?? c.accountName,
    wins: overall.wins ?? 0,
    kills: overall.kills ?? 0,
    matches: overall.matches ?? 0,
    at: now,
  };
}

/**
 * The public API gives running totals, not single matches, so the check is
 * the change in totals since lock. That makes this the weakest data adapter:
 * it cannot tell which match a win came from.
 */
export const fortniteAdapter: Adapter<FortniteCondition> = {
  kind: "fortnite",
  snapshot: (c, deps) => fetchTotals(c, deps, Date.now()),
  async check(c, ctx, deps): Promise<Verdict> {
    const base = ctx.baseline as FortniteTotals | undefined;
    if (!base) throw new VerifierError("No baseline was recorded when this challenge locked");
    const current = await fetchTotals(c, deps, ctx.now);
    const gained = current[c.goal] - base[c.goal];
    const label = c.goal === "wins" ? "Victory Royales" : "eliminations";
    const evidence = {
      source: "fortnite",
      ref: `${base.accountId}:${c.goal}:${base[c.goal]}->${current[c.goal]}`,
      summary: `${c.accountName} gained ${gained} ${label} over ${current.matches - base.matches} matches since lock (needed ${c.count}).`,
    };
    if (gained >= c.count) return { outcome: "success", reason: `Gained ${gained} ${label}`, evidence };
    if (ctx.now > ctx.deadline) {
      return { outcome: "failure", reason: `Deadline passed with ${gained} of ${c.count} ${label}`, evidence };
    }
    return pending(`${gained} of ${c.count} ${label} so far`);
  },
};
