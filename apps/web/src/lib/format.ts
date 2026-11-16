import { type Challenge, GAMES, tierOf } from "@potted/core";

export const STATUS_LABEL: Record<Challenge["status"], string> = {
  open: "Open for pledges",
  locked: "Attempt in progress",
  paid: "Paid out",
  failed: "Refunded",
};

export function gameOf(challenge: Challenge) {
  return GAMES.find((g) => g.id === challenge.gameId) ?? GAMES[GAMES.length - 1]!;
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
