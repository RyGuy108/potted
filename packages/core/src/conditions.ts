/**
 * A condition is the precise, checkable statement fans fund. Each kind maps
 * to one verifier adapter. Conditions are frozen when a challenge is created.
 */

export type LichessSpeed = "bullet" | "blitz" | "rapid" | "classical";

export interface LichessCondition {
  kind: "lichess";
  username: string;
  goal: "win_next_rated";
  /** Limit to one time control. Any speed counts when omitted. */
  speed?: LichessSpeed;
  /** Games shorter than this many half-moves are ignored (anti-collusion). */
  minPlies: number;
  minOpponentRating?: number;
}

export interface BrawlStarsCondition {
  kind: "brawlstars";
  /** Player tag without the leading "#". */
  playerTag: string;
  goal: "wins_in_next_battles";
  wins: number;
  battles: number;
}

export interface FortniteCondition {
  kind: "fortnite";
  accountName: string;
  /** Totals gained between lock and deadline. */
  goal: "wins" | "kills";
  count: number;
}

export interface OptimisticCondition {
  kind: "optimistic";
  /** Free-text game or activity, e.g. "GTA VI". */
  game: string;
  statement: string;
  /** How long funders have to dispute a claim before it settles. */
  disputeWindowSecs: number;
  /** What the clip has to show, set by the streamer up front so a dispute has something to be judged against. */
  proof?: string;
}

/**
 * Covers any Steam game without a checker of its own: Steam records when
 * each achievement was unlocked, so "unlock X during the attempt" is data.
 */
export interface SteamCondition {
  kind: "steam";
  /** The streamer's 17-digit SteamID64. Their game details must be public. */
  steamId: string;
  appId: number;
  gameName: string;
  /** The achievement's API name, as Steam stores it. */
  achievement: string;
  /** The achievement's display title, shown to fans. */
  achievementTitle: string;
}

/**
 * A goal for the stream itself, checked against Twitch's live data: stay
 * live for a stretch, or reach a number of people watching at once.
 */
export interface TwitchCondition {
  kind: "twitch";
  /** The channel's login, as in twitch.tv/<login>. */
  channel: string;
  goal: "live_minutes" | "peak_viewers";
  /** Minutes live without a break, or concurrent viewers. */
  count: number;
}

export type Condition =
  | LichessCondition
  | TwitchCondition
  | BrawlStarsCondition
  | FortniteCondition
  | SteamCondition
  | OptimisticCondition;

export type VerifierKind = Condition["kind"];
export type Tier = "data" | "optimistic";

export function tierOf(kind: VerifierKind): Tier {
  return kind === "optimistic" ? "optimistic" : "data";
}

/** Brawl Stars tags are case-insensitive and often typed with "#" or "O". */
export function normalizeBrawlTag(tag: string): string {
  return tag.trim().replace(/^#/, "").toUpperCase().replace(/O/g, "0");
}

export function describeCondition(c: Condition): string {
  switch (c.kind) {
    case "lichess": {
      const speed = c.speed ? `${c.speed} ` : "";
      const floor = c.minOpponentRating ? ` against a ${c.minOpponentRating}+ opponent` : "";
      return `${c.username} wins their next rated ${speed}game on Lichess${floor}`;
    }
    case "brawlstars":
      return `#${c.playerTag} wins ${c.wins} of their next ${c.battles} Brawl Stars battles`;
    case "fortnite":
      return c.goal === "wins"
        ? `${c.accountName} gets ${c.count} Victory Royale${c.count === 1 ? "" : "s"} in Fortnite`
        : `${c.accountName} gets ${c.count} eliminations in Fortnite`;
    case "steam":
      return `${c.gameName}: unlock "${c.achievementTitle}" on Steam`;
    case "twitch":
      return c.goal === "live_minutes"
        ? `${c.channel} stays live on Twitch for ${c.count} minutes straight`
        : `${c.channel} reaches ${c.count.toLocaleString("en-US")} viewers at once on Twitch`;
    case "optimistic":
      return `${c.game}: ${c.statement}`;
  }
}

function requireString(value: unknown, field: string, max = 120): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} is required`);
  if (value.length > max) throw new Error(`${field} is too long`);
  return value.trim();
}

function requireInt(value: unknown, field: string, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${field} must be a whole number from ${min} to ${max}`);
  }
  return n;
}

const SPEEDS: LichessSpeed[] = ["bullet", "blitz", "rapid", "classical"];

/** Parses untrusted input into a Condition, or throws with a readable reason. */
export function parseCondition(input: unknown): Condition {
  if (typeof input !== "object" || input === null) throw new Error("Condition is required");
  const raw = input as Record<string, unknown>;
  switch (raw.kind) {
    case "lichess": {
      const speed = raw.speed == null || raw.speed === "" ? undefined : (raw.speed as LichessSpeed);
      if (speed && !SPEEDS.includes(speed)) throw new Error("Unknown Lichess speed");
      const username = requireString(raw.username, "Lichess username", 30);
      if (!/^[A-Za-z0-9_-]{2,30}$/.test(username)) throw new Error("Invalid Lichess username");
      return {
        kind: "lichess",
        username,
        goal: "win_next_rated",
        speed,
        minPlies: raw.minPlies == null ? 20 : requireInt(raw.minPlies, "Minimum moves", 2, 200),
        minOpponentRating:
          raw.minOpponentRating == null || raw.minOpponentRating === ""
            ? undefined
            : requireInt(raw.minOpponentRating, "Opponent rating floor", 400, 3500),
      };
    }
    case "brawlstars": {
      const playerTag = normalizeBrawlTag(requireString(raw.playerTag, "Player tag", 16));
      if (!/^[0-9A-Z]{3,15}$/.test(playerTag)) throw new Error("Invalid Brawl Stars player tag");
      const battles = requireInt(raw.battles, "Battles", 1, 20);
      const wins = requireInt(raw.wins, "Wins", 1, battles);
      return { kind: "brawlstars", playerTag, goal: "wins_in_next_battles", wins, battles };
    }
    case "fortnite": {
      if (raw.goal !== "wins" && raw.goal !== "kills") throw new Error("Unknown Fortnite goal");
      return {
        kind: "fortnite",
        accountName: requireString(raw.accountName, "Epic account name", 40),
        goal: raw.goal,
        count: requireInt(raw.count, "Count", 1, 500),
      };
    }
    case "steam": {
      const steamId = requireString(raw.steamId, "Steam ID", 17);
      if (!/^\d{17}$/.test(steamId)) throw new Error("Steam ID must be the 17-digit SteamID64");
      const achievement = requireString(raw.achievement, "Achievement API name", 80);
      return {
        kind: "steam",
        steamId,
        appId: requireInt(raw.appId, "Steam app id", 1, 99_999_999),
        gameName: requireString(raw.gameName, "Game name", 40),
        achievement,
        achievementTitle: raw.achievementTitle ? requireString(raw.achievementTitle, "Achievement title", 80) : achievement,
      };
    }
    case "twitch": {
      const channel = requireString(raw.channel, "Twitch channel", 25).replace(/^@/, "").toLowerCase();
      if (!/^[a-z0-9_]{3,25}$/.test(channel)) throw new Error("Invalid Twitch channel name");
      if (raw.goal !== "live_minutes" && raw.goal !== "peak_viewers") throw new Error("Unknown Twitch goal");
      return {
        kind: "twitch",
        channel,
        goal: raw.goal,
        count: raw.goal === "live_minutes" ? requireInt(raw.count, "Minutes", 10, 1440) : requireInt(raw.count, "Viewers", 2, 1_000_000),
      };
    }
    case "optimistic":
      return {
        kind: "optimistic",
        game: requireString(raw.game, "Game", 40),
        statement: requireString(raw.statement, "Challenge", 200),
        ...(typeof raw.proof === "string" && raw.proof.trim() ? { proof: requireString(raw.proof, "Proof rule", 160) } : {}),
        disputeWindowSecs:
          raw.disputeWindowSecs == null
            ? 120
            : requireInt(raw.disputeWindowSecs, "Dispute window", 10, 86_400),
      };
    default:
      throw new Error("Unknown verifier kind");
  }
}

export interface GameInfo {
  id: string;
  name: string;
  verifier: VerifierKind;
  /** One line shown to fans about how the result is decided. */
  how: string;
  /** Shown up front; the rest sit behind "Show more". */
  featured?: boolean;
  /** An example challenge, shown in the directory and as the form's placeholder. */
  example?: string;
}

const CLIP = "Streamer posts a clip; funders can dispute before it settles.";

export const GAMES: GameInfo[] = [
  { id: "chess", name: "Chess", verifier: "lichess", how: "Checked against the public Lichess game record.", featured: true, example: "Win the next rated blitz game" },
  { id: "brawlstars", name: "Brawl Stars", verifier: "brawlstars", how: "Checked against the official battle log.", featured: true, example: "Win 3 of the next 5 battles" },
  { id: "fortnite", name: "Fortnite", verifier: "fortnite", how: "Checked against public player stats.", featured: true, example: "Get 10 eliminations" },
  { id: "steam", name: "Any Steam game", verifier: "steam", how: "Checked against the time Steam recorded the achievement.", featured: true, example: "Unlock a named achievement before the deadline" },
  { id: "twitch", name: "Twitch stream goals", verifier: "twitch", how: "Checked against Twitch's live stream data.", featured: true, example: "Stay live for 3 hours straight" },
  { id: "gta6", name: "GTA VI", verifier: "optimistic", how: CLIP, featured: true, example: "Finish the first heist without getting busted" },
  // Stream types beyond the featured games. Each settles by clip until it
  // gets a data checker of its own: add an adapter in packages/verifier and
  // change `verifier` here.
  { id: "speedrun", name: "Speedruns", verifier: "optimistic", how: CLIP, example: "Beat my personal best in any% tonight" },
  { id: "minecraft", name: "Minecraft", verifier: "optimistic", how: CLIP, example: "Beat the Ender Dragon in hardcore" },
  { id: "fitness", name: "Fitness and IRL", verifier: "optimistic", how: CLIP, example: "Finish a 5k on the treadmill without stopping" },
  { id: "cooking", name: "Cooking", verifier: "optimistic", how: CLIP, example: "Plate a three-course dinner in 45 minutes" },
  { id: "music", name: "Music", verifier: "optimistic", how: CLIP, example: "Learn and play a requested song by the end of stream" },
  { id: "art", name: "Art and making", verifier: "optimistic", how: CLIP, example: "Finish the commission live in one sitting" },
  { id: "study", name: "Study and coding", verifier: "optimistic", how: CLIP, example: "Ship the feature before the stream ends" },
  { id: "other", name: "Anything else", verifier: "optimistic", how: CLIP, featured: true, example: "Any outcome a viewer could confirm from a clip" },
];
