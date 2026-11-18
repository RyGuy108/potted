import { GAMES } from "@potted/core";

/**
 * The inputs a challenge needs, per game, described as data. The web form
 * and the browser extension both build their forms from this, so a new
 * game's fields are added once.
 */
export interface TermField {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  numeric?: boolean;
  options?: [value: string, label: string][];
  /** The starting value. */
  initial?: string;
}

const BY_VERIFIER: Record<string, TermField[]> = {
  lichess: [
    { name: "username", label: "Your Lichess username", placeholder: "ryan_plays", required: true },
    { name: "speed", label: "Time control", options: [["", "Any"], ["bullet", "Bullet"], ["blitz", "Blitz"], ["rapid", "Rapid"], ["classical", "Classical"]] },
    { name: "minOpponentRating", label: "Opponent rating floor (optional)", placeholder: "1500", numeric: true },
  ],
  brawlstars: [
    { name: "playerTag", label: "Your player tag", placeholder: "#2PP0LYQ", required: true },
    { name: "wins", label: "Wins needed", numeric: true, required: true, initial: "3" },
    { name: "battles", label: "In the next battles", numeric: true, required: true, initial: "5" },
  ],
  fortnite: [
    { name: "accountName", label: "Your Epic account name", required: true },
    { name: "goal", label: "Goal", options: [["wins", "Victory Royales"], ["kills", "Eliminations"]], initial: "kills" },
    { name: "count", label: "How many", numeric: true, required: true, initial: "10" },
  ],
  steam: [
    { name: "gameName", label: "Game", placeholder: "Hollow Knight", required: true },
    { name: "appId", label: "Steam app id", placeholder: "367520", numeric: true, required: true },
    { name: "steamId", label: "Your SteamID64 (17 digits)", placeholder: "7656119…", numeric: true, required: true },
    { name: "achievementTitle", label: "Achievement title", placeholder: "Steel Soul", required: true },
    { name: "achievement", label: "Achievement API name", placeholder: "STEEL_SOUL", required: true },
  ],
  optimistic: [
    { name: "statement", label: "Challenge", required: true },
    { name: "proof", label: "What the clip must show (optional)", placeholder: "The end screen with the timer visible" },
    { name: "disputeWindowSecs", label: "Dispute window (seconds)", numeric: true, required: true, initial: "120" },
  ],
};

/** How much of the pot can be paid when the attempt starts; the rest pays only on success. */
export const UPFRONT_OPTIONS: [string, string][] = [
  ["0", "Nothing: all on completion"],
  ["10", "10% up front"],
  ["25", "25% up front"],
  ["50", "50% up front"],
];

/** Asked for every challenge, whatever the game. */
export const POT_FIELDS: TermField[] = [
  { name: "goalUsd", label: "Reaches the clouds at ($)", numeric: true, required: true, initial: "20" },
  { name: "pledgeCapUsd", label: "Most one fan can pledge ($)", numeric: true, required: true, initial: "10" },
  { name: "minutes", label: "Minutes to do it", numeric: true, required: true, initial: "30" },
  { name: "upfrontPct", label: "Paid to you when you start", options: UPFRONT_OPTIONS, initial: "0" },
];

export function termFields(gameId: string): TermField[] {
  const game = GAMES.find((g) => g.id === gameId);
  if (!game) return [];
  const fields = BY_VERIFIER[game.verifier] ?? [];
  if (game.verifier !== "optimistic") return fields;
  return [
    // Only "Anything else" asks what the activity is; the rest are named by their type.
    ...(game.id === "other" ? [{ name: "game", label: "Game or activity", placeholder: "Cooking stream", required: true }] : []),
    ...fields.map((f) => (f.name === "statement" ? { ...f, placeholder: game.example ?? "Something a viewer can confirm from a clip" } : f)),
  ];
}

/** Turns a form's values into the condition the server validates. */
export function conditionFromFields(gameId: string, f: Record<string, string | undefined>): unknown {
  const game = GAMES.find((g) => g.id === gameId);
  if (!game) return undefined;
  switch (game.verifier) {
    case "lichess":
      return { kind: "lichess", username: f.username, speed: f.speed, minOpponentRating: f.minOpponentRating };
    case "brawlstars":
      return { kind: "brawlstars", playerTag: f.playerTag, wins: f.wins, battles: f.battles };
    case "fortnite":
      return { kind: "fortnite", accountName: f.accountName, goal: f.goal, count: f.count };
    case "steam":
      return { kind: "steam", steamId: f.steamId, appId: f.appId, gameName: f.gameName, achievement: f.achievement, achievementTitle: f.achievementTitle };
    case "optimistic":
      return { kind: "optimistic", game: game.id === "other" ? f.game : game.name, statement: f.statement, disputeWindowSecs: f.disputeWindowSecs, proof: f.proof };
  }
}
