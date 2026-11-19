import { liveStreams } from "./service";
import { type User, db } from "./store";

/**
 * A live stream picked at random, leaning toward creators this planter
 * hasn't met yet: anyone they already follow or have backed is skipped
 * while there are others live. `skip` is the stream they just came from.
 */
export function surprisePick(user: User | undefined, skip?: string, random = Math.random): string | null {
  const live = liveStreams().filter((l) => l.streamer.handle && l.streamer.id !== user?.id);
  if (live.length === 0) return null;
  const known = new Set<string>();
  if (user) {
    for (const f of db().follows ?? []) if (f.fanId === user.id) known.add(f.streamerId);
    const backed = new Set(db().pledges.filter((p) => p.userId === user.id).map((p) => p.challengeId));
    for (const c of db().challenges) if (backed.has(c.id)) known.add(c.streamerId);
  }
  const notJustSeen = live.filter((l) => l.streamer.handle !== skip);
  const pool = notJustSeen.length > 0 ? notJustSeen : live;
  const fresh = pool.filter((l) => !known.has(l.streamer.id));
  const from = fresh.length > 0 ? fresh : pool;
  return from[Math.floor(random() * from.length)]!.streamer.handle!;
}
