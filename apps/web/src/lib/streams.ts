import { GAMES } from "@potted/core";
import { twitchChannel } from "./twitch";

/**
 * Where a climber is streaming: a Twitch, YouTube or Kick link, read into
 * the platform and channel, then filled in with the stream's title and game
 * where the platform shares them without a login.
 */

export type Platform = "twitch" | "youtube" | "kick";

export const PLATFORM_NAMES: Record<Platform, string> = { twitch: "Twitch", youtube: "YouTube", kick: "Kick" };

export interface StreamLink {
  platform: Platform;
  /** Twitch login, YouTube handle (without @) or Kick slug. Empty for a bare YouTube video link. */
  channel: string;
  /** A YouTube video or live id, when the link points at one. */
  videoId?: string;
  /** The link, tidied: always https, no tracking parameters. */
  url: string;
}

const TWITCH_RESERVED = new Set(["directory", "videos", "settings", "subscriptions", "inventory", "wallet", "drops", "search", "downloads", "p", "jobs", "turbo", "store"]);

/** Reads a stream link. Throws a message a person can act on when it is not one. */
export function parseStreamLink(input: string): StreamLink {
  const raw = input.trim();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new Error("Paste the link to your stream, like twitch.tv/yourname");
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|go)\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  if (host === "twitch.tv") {
    const login = parts[0]?.toLowerCase() ?? "";
    if (!/^[a-z0-9_]{2,25}$/.test(login) || TWITCH_RESERVED.has(login)) throw new Error("That Twitch link has no channel in it");
    return { platform: "twitch", channel: login, url: `https://www.twitch.tv/${login}` };
  }
  if (host === "kick.com") {
    const slug = parts[0]?.toLowerCase() ?? "";
    if (!/^[a-z0-9_-]{2,30}$/.test(slug)) throw new Error("That Kick link has no channel in it");
    return { platform: "kick", channel: slug, url: `https://kick.com/${slug}` };
  }
  if (host === "youtube.com" || host === "youtu.be") {
    const handle = parts[0]?.startsWith("@") ? parts[0].slice(1).toLowerCase() : "";
    const videoId =
      host === "youtu.be" ? parts[0] : parts[0] === "watch" ? (url.searchParams.get("v") ?? undefined) : parts[0] === "live" ? parts[1] : handle && parts[1] === "live" ? undefined : undefined;
    if (videoId && !/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) throw new Error("That YouTube link has no video in it");
    if (handle && !/^[a-z0-9_.-]{2,40}$/.test(handle)) throw new Error("That YouTube handle doesn't look right");
    if (!handle && !videoId) throw new Error("Use your channel link (youtube.com/@you) or your live video's link");
    return {
      platform: "youtube",
      channel: handle,
      ...(videoId ? { videoId } : {}),
      url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : `https://www.youtube.com/@${handle}/live`,
    };
  }
  throw new Error("Potted reads Twitch, YouTube and Kick links");
}

export interface StreamInfo {
  title?: string;
  /** The platform's name for what is being streamed. */
  category?: string;
  /** Display name of the channel. */
  channelName?: string;
  /** True or false when the platform said; undefined when it could not be checked. */
  live?: boolean;
}

interface Deps {
  fetch: typeof fetch;
}

const TIMEOUT_MS = 5000;

/** Asks the platform about the stream. Never throws: anything it cannot learn is left out. */
export async function lookupStream(link: StreamLink, deps: Deps = { fetch }): Promise<StreamInfo> {
  try {
    if (link.platform === "twitch") {
      const channel = await twitchChannel(link.channel);
      if (!channel) return {};
      return { channelName: channel.displayName, live: Boolean(channel.live), ...(channel.live ? { title: channel.live.title, category: channel.live.gameName } : {}) };
    }
    if (link.platform === "kick") {
      const res = await deps.fetch(`https://kick.com/api/v2/channels/${link.channel}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) return {};
      const body = (await res.json()) as { user?: { username?: string }; livestream?: { session_title?: string; is_live?: boolean; categories?: { name?: string }[] } | null };
      const live = body.livestream;
      return {
        channelName: body.user?.username,
        live: Boolean(live?.is_live),
        ...(live ? { title: live.session_title, category: live.categories?.[0]?.name } : {}),
      };
    }
    // YouTube's oEmbed needs no key; it knows a video's title and channel, not its category.
    const res = await deps.fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(link.url)}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return {};
    const body = (await res.json()) as { title?: string; author_name?: string };
    return { title: body.title, channelName: body.author_name };
  } catch {
    return {};
  }
}

/** Common category names that do not match a game's name word for word. */
const ALIASES: Record<string, string> = {
  "grand theft auto vi": "gta6",
  "grand theft auto 6": "gta6",
  "gta 6": "gta6",
  "just chatting": "other",
  "irl": "fitness",
  "fitness & health": "fitness",
  "food & drink": "cooking",
  "art": "art",
  "makers & crafting": "art",
  "music": "music",
  "software and game development": "study",
  "science & technology": "study",
};

/** The Potted game for a platform's category, or for a title that names one. */
export function gameFor(category?: string, title?: string): { gameId: string; customGame?: string } {
  const text = (category ?? "").trim().toLowerCase();
  if (text) {
    if (ALIASES[text]) return { gameId: ALIASES[text]! };
    const game = GAMES.find((g) => g.id !== "other" && (g.name.toLowerCase() === text || text.includes(g.name.toLowerCase())));
    if (game) return { gameId: game.id };
  }
  const t = (title ?? "").toLowerCase();
  const named = GAMES.find((g) => g.id !== "other" && g.id !== "steam" && g.id !== "twitch" && (t.includes(g.name.toLowerCase()) || t.includes(g.id)));
  if (named) return { gameId: named.id };
  return category ? { gameId: "other", customGame: category.slice(0, 40) } : { gameId: "other" };
}
