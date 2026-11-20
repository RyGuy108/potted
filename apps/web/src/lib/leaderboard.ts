import * as service from "./service";
import { type User, db } from "./store";

/**
 * Leaderboards. Planters rank by garden XP (the same points that set their
 * level, earned by backing, completions, being first in and topping off
 * pots, never by pledge size alone). Climbers rank by how many distinct
 * planters have backed them. Money a climber has earned or raised is kept
 * off this board on purpose, for privacy. Demo accounts with no activity are
 * left off.
 */

export interface PlanterRow {
  user: User;
  rank: number;
  xp: number;
  level: { index: number; name: string; floor: number; next?: { name: string; at: number } };
  plantedMicro: number;
  backed: number;
  grown: number;
  /** Share of their settled challenges that were completed, 0 to 1; null before any settled. */
  hitRate: number | null;
}

export interface ClimberRow {
  user: User;
  rank: number;
  challenges: number;
  completed: number;
  completionRate: number | null;
  /** Distinct planters who have pledged to any of their challenges. */
  planters: number;
}

export function planterBoard(): PlanterRow[] {
  const state = db();
  const settled = new Map(state.challenges.map((c) => [c.id, c.status]));
  const rows = state.users
    .filter((u) => u.role === "fan")
    .map((user) => {
      const mine = state.pledges.filter((p) => p.userId === user.id);
      if (mine.length === 0) return null;
      const stats = service.planterStats(user);
      const statuses = [...new Set(mine.map((p) => p.challengeId))].map((id) => settled.get(id));
      const done = statuses.filter((s) => s === "paid" || s === "failed");
      return {
        user,
        rank: 0,
        xp: stats.xp,
        level: stats.level,
        plantedMicro: mine.reduce((sum, p) => sum + p.amountMicro, 0),
        backed: stats.backed,
        grown: stats.grown,
        hitRate: done.length ? done.filter((s) => s === "paid").length / done.length : null,
      };
    })
    .filter((r): r is PlanterRow => r !== null)
    .sort((a, b) => b.xp - a.xp || b.plantedMicro - a.plantedMicro);
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

export function climberBoard(): ClimberRow[] {
  const state = db();
  const rows = service
    .listStreamers()
    .map((user) => {
      const list = service.stageChallenges(user.id);
      if (list.length === 0) return null;
      const settled = list.filter((c) => c.status === "paid" || c.status === "failed");
      const completed = list.filter((c) => c.status === "paid").length;
      const ids = new Set(list.map((c) => c.id));
      return {
        user,
        rank: 0,
        challenges: list.length,
        completed,
        completionRate: settled.length ? completed / settled.length : null,
        planters: new Set(state.pledges.filter((p) => ids.has(p.challengeId)).map((p) => p.userId)).size,
      };
    })
    .filter((r): r is ClimberRow => r !== null)
    .sort((a, b) => b.planters - a.planters || b.completed - a.completed || b.challenges - a.challenges);
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}
