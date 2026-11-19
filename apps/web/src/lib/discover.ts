import { followersOf } from "./notifications";
import * as service from "./service";
import type { StreamListing } from "./service";
import { type User, db } from "./store";

/**
 * Picks for the browse page. "For you" ranks live streams by what a planter
 * has shown interest in; "Trending" ranks them by momentum. Both use only
 * real activity: follows, pledges and pots.
 */

const HOUR = 60 * 60_000;

export interface Pick extends StreamListing {
  /** Why this stream is here, in a few words. */
  reason: string;
}

/** Live streams for one planter: climbers they follow, climbers they've backed, games they back. */
export function forYou(fan: User, live: StreamListing[] = service.liveStreams(), limit = 6): Pick[] {
  if (fan.role !== "fan") return [];
  const state = db();
  const mine = state.pledges.filter((p) => p.userId === fan.id);
  const backedClimbers = new Map<string, number>();
  const games = new Map<string, number>();
  for (const p of mine) {
    const c = state.challenges.find((x) => x.id === p.challengeId);
    if (!c) continue;
    backedClimbers.set(c.streamerId, (backedClimbers.get(c.streamerId) ?? 0) + 1);
    games.set(c.gameId, (games.get(c.gameId) ?? 0) + 1);
  }
  const follows = new Set((state.follows ?? []).filter((f) => f.fanId === fan.id).map((f) => f.streamerId));
  const scored = live.map((l) => {
    const followed = follows.has(l.streamer.id);
    const backed = backedClimbers.get(l.streamer.id) ?? 0;
    const game = games.get(l.headline.gameId) ?? 0;
    const score = (followed ? 10 : 0) + Math.min(backed, 5) * 2 + Math.min(game, 6);
    const reason = followed
      ? "You follow them"
      : backed > 0
        ? `You've backed ${backed} of theirs`
        : game > 0
          ? `You back ${service.gameOfId(l.headline.gameId)} challenges`
          : "";
    return { ...l, reason, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.potMicro - a.potMicro)
    .slice(0, limit)
    .map(({ score: _score, ...pick }) => pick);
}

/** Live streams with the most going on right now: recent pledges and new planters first, then pot size and followers. */
export function trending(live: StreamListing[] = service.liveStreams(), limit = 6, now = Date.now()): Pick[] {
  const state = db();
  const scored = live.map((l) => {
    const ids = new Set(state.challenges.filter((c) => c.streamerId === l.streamer.id && (c.status === "open" || c.status === "locked")).map((c) => c.id));
    const recent = state.pledges.filter((p) => ids.has(p.challengeId) && now - p.createdAt < HOUR);
    const recentPlanters = new Set(recent.map((p) => p.userId)).size;
    const recentMicro = recent.reduce((sum, p) => sum + p.amountMicro, 0);
    const followers = followersOf(l.streamer.id).length;
    const score = recentPlanters * 4 + recentMicro / 1_000_000 + l.planters + l.potMicro / 5_000_000 + followers * 0.5;
    const reason =
      recentPlanters > 0
        ? `${recentPlanters} new ${recentPlanters === 1 ? "planter" : "planters"} in the last hour`
        : `${l.planters} ${l.planters === 1 ? "planter" : "planters"} in the pot`;
    return { ...l, reason, score };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _score, ...pick }) => pick);
}
