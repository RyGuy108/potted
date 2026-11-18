/**
 * Demo audience numbers for the browse page: how many people are watching
 * and how many streams are live in each game. They are made up, steady for
 * ten minutes at a time and drifting gently between, so the directory looks
 * like a busy one during a demo. Turn them off with POTTED_MOCK_ACTIVITY=off;
 * everything else in the app (pots, pledges, challenges) is always real.
 */

export const mockActivityOn = () => process.env.POTTED_MOCK_ACTIVITY !== "off";

/** How busy each kind of stream is, roughly as on a big streaming site. */
const POPULARITY: Record<string, number> = {
  gta6: 1,
  fortnite: 0.8,
  minecraft: 0.75,
  steam: 0.55,
  speedrun: 0.3,
  chess: 0.35,
  brawlstars: 0.3,
  fitness: 0.18,
  cooking: 0.22,
  music: 0.25,
  art: 0.2,
  study: 0.15,
  other: 0.4,
};

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}

/** A number between 0 and 1 for a key that moves smoothly over time. */
function drift(key: string, now: number): number {
  const window = Math.floor(now / 600_000);
  const a = hash(`${key}:${window}`);
  const b = hash(`${key}:${window + 1}`);
  const t = (now % 600_000) / 600_000;
  return a + (b - a) * t;
}

export function mockGame(gameId: string, now = Date.now()): { streams: number; watching: number } {
  const pop = POPULARITY[gameId] ?? 0.2;
  const d = drift(gameId, now);
  return {
    streams: Math.max(1, Math.round(pop * (14 + 10 * d))),
    watching: Math.round(pop * (2600 + 2400 * d) + 40 * d),
  };
}

/** Viewers for one stream, steadier for the same handle. */
export function mockViewers(handle: string, now = Date.now()): number {
  const base = 40 + hash(handle) * 1800;
  return Math.round(base * (0.85 + drift(handle, now) * 0.3));
}

export function mockTotals(gameIds: string[], now = Date.now()): { streams: number; watching: number } {
  return gameIds.reduce(
    (sum, id) => {
      const g = mockGame(id, now);
      return { streams: sum.streams + g.streams, watching: sum.watching + g.watching };
    },
    { streams: 0, watching: 0 },
  );
}

export function compact(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(n);
}
