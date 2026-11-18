import { type Challenge, GAMES, tierOf } from "@potted/core";

export const STATUS_LABEL: Record<Challenge["status"], string> = {
  open: "Open for pledges",
  locked: "Attempt in progress",
  paid: "Paid out",
  failed: "Refunded",
};

export function gameOf(challenge: Pick<Challenge, "gameId">) {
  return GAMES.find((g) => g.id === challenge.gameId) ?? GAMES[GAMES.length - 1]!;
}

/** The actual game's name where the challenge names one (a Steam game, a clip-checked game), else the stream type's. */
export function gameNameOf(challenge: Pick<Challenge, "gameId" | "condition">): string {
  const c = challenge.condition;
  if (c.kind === "steam" && c.gameName) return c.gameName;
  if (c.kind === "optimistic" && c.game && challenge.gameId !== "gta6") return c.game;
  return gameOf(challenge).name;
}

export function tierLabel(challenge: Challenge): string {
  return tierOf(challenge.condition.kind) === "data" ? "Data-verified" : "Clip + dispute window";
}

export function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Which data adapters have the keys they need. */
export function adapterStatus(): Record<string, string | null> {
  return {
    lichess: null,
    brawlstars: process.env.BRAWLSTARS_API_KEY ? null : "Needs BRAWLSTARS_API_KEY in .env.local",
    fortnite: process.env.FORTNITE_API_KEY ? null : "Needs FORTNITE_API_KEY in .env.local",
    steam: process.env.STEAM_API_KEY ? null : "Needs STEAM_API_KEY in .env.local",
    optimistic: null,
  };
}
