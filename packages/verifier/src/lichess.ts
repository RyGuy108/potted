import type { LichessCondition, Verdict } from "@potted/core";
import { type Adapter, type CheckContext, type Deps, VerifierError, pending } from "./types";

/** The fields we read from Lichess's game export. */
export interface LichessGame {
  id: string;
  rated: boolean;
  variant: string;
  speed: string;
  /** How the game was paired: "pool" is quick pairing, "friend" a direct challenge. */
  source?: string;
  status: string;
  createdAt: number;
  lastMoveAt: number;
  winner?: "white" | "black";
  moves?: string;
  players: Record<"white" | "black", { user?: { name: string; id?: string }; rating?: number }>;
}

/**
 * Pairings a streamer cannot arrange with a friend. Lobby seeks and direct
 * challenges are left out on purpose.
 */
const MATCHMADE_SOURCES = new Set(["pool", "arena", "swiss", "tournament"]);
const NEVER_PLAYED = new Set(["aborted", "noStart", "created", "started"]);

export function colorOf(game: LichessGame, username: string): "white" | "black" | null {
  const me = username.toLowerCase();
  if (game.players.white.user?.name.toLowerCase() === me) return "white";
  if (game.players.black.user?.name.toLowerCase() === me) return "black";
  return null;
}

/** Returns null when the game counts, or the reason it is ignored. */
export function ineligibleReason(game: LichessGame, c: LichessCondition): string | null {
  const color = colorOf(game, c.username);
  if (!color) return "player not in game";
  if (!game.rated) return "casual game";
  if (game.variant !== "standard") return "variant game";
  if (c.speed && game.speed !== c.speed) return `not ${c.speed}`;
  if (NEVER_PLAYED.has(game.status)) return "not played";
  if (game.source && !MATCHMADE_SOURCES.has(game.source)) return `paired by ${game.source}`;
  const plies = game.moves ? game.moves.trim().split(/\s+/).length : 0;
  if (plies < c.minPlies) return `only ${plies} half-moves`;
  if (c.minOpponentRating) {
    const opponent = game.players[color === "white" ? "black" : "white"];
    if ((opponent.rating ?? 0) < c.minOpponentRating) return "opponent below rating floor";
  }
  return null;
}

async function fetchGames(c: LichessCondition, ctx: CheckContext, deps: Deps): Promise<LichessGame[]> {
  const params = new URLSearchParams({
    since: String(ctx.lockedAt),
    rated: "true",
    finished: "true",
    moves: "true",
    max: "30",
    sort: "dateAsc",
  });
  if (c.speed) params.set("perfType", c.speed);
  const headers: Record<string, string> = { Accept: "application/x-ndjson" };
  if (deps.env.LICHESS_TOKEN) headers.Authorization = `Bearer ${deps.env.LICHESS_TOKEN}`;

  const url = `https://lichess.org/api/games/user/${encodeURIComponent(c.username)}?${params}`;
  const res = await deps.fetch(url, { headers });
  if (res.status === 404) throw new VerifierError(`Lichess user "${c.username}" not found`, 404);
  if (res.status === 429) throw new VerifierError("Lichess rate limit hit; try again in a minute", 429);
  if (!res.ok) throw new VerifierError(`Lichess returned ${res.status}`, res.status);

  const text = await res.text();
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as LichessGame)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * "Win your next rated game": the first eligible game started after lock and
 * finished before the deadline decides the challenge. A draw is not a win.
 */
export const lichessAdapter: Adapter<LichessCondition> = {
  kind: "lichess",
  async check(c, ctx, deps): Promise<Verdict> {
    const games = await fetchGames(c, ctx, deps);
    let ignored = 0;
    for (const game of games) {
      if (game.createdAt < ctx.lockedAt) continue;
      if (game.lastMoveAt > ctx.deadline) break;
      if (ineligibleReason(game, c)) {
        ignored += 1;
        continue;
      }
      const color = colorOf(game, c.username)!;
      const opponent = game.players[color === "white" ? "black" : "white"];
      const versus = `${opponent.user?.name ?? "Anonymous"} (${opponent.rating ?? "?"})`;
      const pairing = game.source ? `paired by ${game.source}` : "pairing source not reported";
      const won = game.winner === color;
      const result = won ? "won" : game.winner ? "lost" : "drew";
      return {
        outcome: won ? "success" : "failure",
        reason: `${c.username} ${result} against ${versus}`,
        evidence: {
          source: "lichess",
          ref: game.id,
          url: `https://lichess.org/${game.id}`,
          summary: `${c.username} ${result} a rated ${game.speed} game as ${color} against ${versus}, ${pairing}, ended by ${game.status}.`,
        },
      };
    }
    if (ctx.now > ctx.deadline) {
      return { outcome: "failure", reason: "No eligible game was finished before the deadline" };
    }
    return pending(
      ignored > 0
        ? `Waiting for an eligible game (${ignored} ignored so far)`
        : "Waiting for the next rated game",
    );
  },
};
