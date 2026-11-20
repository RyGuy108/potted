/**
 * Public channel details from the Twitch API: profile picture, offline
 * banner and whether the channel is live right now. It uses an app access
 * token (client credentials) from the same Twitch app as sign-in, so a
 * climber does not have to authorize anything. Answers are cached briefly;
 * any failure just means no Twitch details on the page.
 */

export interface TwitchLive {
  title: string;
  gameName: string;
  viewers: number;
  startedAt: string;
  /** A current frame of the stream. */
  thumbnailUrl: string;
}

export interface TwitchChannel {
  login: string;
  displayName: string;
  profileImageUrl: string;
  offlineImageUrl: string;
  url: string;
  live: TwitchLive | null;
}

interface Deps {
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
  now: () => number;
}

const defaults = (): Deps => ({ fetch: globalThis.fetch, env: process.env, now: Date.now });

const CACHE_MS = 60_000;
let appToken: { token: string; expires: number; clientId: string } | null = null;
const cache = new Map<string, { at: number; value: TwitchChannel | null }>();

export function twitchConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET);
}

async function token(deps: Deps): Promise<string> {
  const clientId = deps.env.TWITCH_CLIENT_ID!;
  if (appToken && appToken.clientId === clientId && appToken.expires > deps.now() + 60_000) return appToken.token;
  const params = new URLSearchParams({ client_id: clientId, client_secret: deps.env.TWITCH_CLIENT_SECRET!, grant_type: "client_credentials" });
  const res = await deps.fetch(`${deps.env.TWITCH_AUTH_BASE || "https://id.twitch.tv"}/oauth2/token?${params}`, { method: "POST", signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Twitch token ${res.status}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  appToken = { token: body.access_token, expires: deps.now() + body.expires_in * 1000, clientId };
  return appToken.token;
}

async function helix<T>(path: string, deps: Deps): Promise<T[]> {
  const res = await deps.fetch(`${deps.env.TWITCH_API_BASE || "https://api.twitch.tv"}/helix/${path}`, {
    headers: { "Client-Id": deps.env.TWITCH_CLIENT_ID!, Authorization: `Bearer ${await token(deps)}` },
    signal: AbortSignal.timeout(5000),
  });
  if (res.status === 401) appToken = null;
  if (!res.ok) throw new Error(`Twitch ${path.split("?")[0]} ${res.status}`);
  return ((await res.json()) as { data: T[] }).data;
}

/** The channel's public details, or null when Twitch is not set up, the channel does not exist, or Twitch did not answer. */
export async function twitchChannel(login: string, deps: Deps = defaults()): Promise<TwitchChannel | null> {
  const clean = login.trim().toLowerCase();
  if (!clean || !/^[a-z0-9_]{2,25}$/.test(clean) || !twitchConfigured(deps.env)) return null;
  const hit = cache.get(clean);
  if (hit && deps.now() - hit.at < CACHE_MS) return hit.value;
  let value: TwitchChannel | null = null;
  try {
    const [users, streams] = await Promise.all([
      helix<{ login: string; display_name: string; profile_image_url: string; offline_image_url: string }>(`users?login=${clean}`, deps),
      helix<{ title: string; game_name: string; viewer_count: number; started_at: string; thumbnail_url: string; type: string }>(`streams?user_login=${clean}`, deps),
    ]);
    const user = users[0];
    if (user) {
      const stream = streams.find((s) => s.type === "live");
      value = {
        login: user.login,
        displayName: user.display_name,
        profileImageUrl: user.profile_image_url,
        offlineImageUrl: user.offline_image_url,
        url: `https://www.twitch.tv/${user.login}`,
        live: stream
          ? {
              title: stream.title,
              gameName: stream.game_name,
              viewers: stream.viewer_count,
              startedAt: stream.started_at,
              // Twitch caches thumbnails; the minute stamp asks for a fresh frame.
              thumbnailUrl: `${stream.thumbnail_url.replace("{width}", "640").replace("{height}", "360")}?t=${Math.floor(deps.now() / 60_000)}`,
            }
          : null,
      };
    }
  } catch (err) {
    console.warn("Twitch lookup failed:", err instanceof Error ? err.message : err);
    // Keep a stale answer rather than flicker to nothing.
    if (hit) return hit.value;
  }
  cache.set(clean, { at: deps.now(), value });
  return value;
}

/** For tests. */
export function resetTwitchCache(): void {
  cache.clear();
  appToken = null;
}

/** Twitch's category address for a name: lower case, words joined by dashes. */
export function categorySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’:.!?]/g, "")
    .replace(/&/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Potted's stream types that map to a Twitch category with a different name. */
const CATEGORY_FOR: Record<string, string> = {
  gta6: "grand-theft-auto-vi",
  brawlstars: "brawl-stars",
  cooking: "food-drink",
  fitness: "fitness-health",
  study: "software-and-game-development",
  music: "music",
  art: "art",
  chess: "chess",
  fortnite: "fortnite",
  minecraft: "minecraft",
};

/**
 * Where on Twitch to watch a game: its category page, or Twitch's front page
 * when there is no game. Needs no API call.
 */
export function twitchCategoryUrl(gameId: string | undefined, gameName?: string): string {
  const slug = (gameId && CATEGORY_FOR[gameId]) || (gameName ? categorySlug(gameName) : "");
  return slug ? `https://www.twitch.tv/directory/category/${slug}` : "https://www.twitch.tv/";
}

/** Authenticated identity is supplied by our OAuth flow, never a user-entered handle. */
export async function twitchAccountSnapshot(subject: string, deps: Deps = defaults()) {
  if (!/^\d+$/.test(subject)) throw new Error("Reconnect Twitch to verify your channel.");
  if (!twitchConfigured(deps.env)) throw new Error("Twitch connection is not configured.");
  const users = await helix<{ id: string; login: string; display_name: string; description: string; profile_image_url: string }>(`users?id=${subject}`, deps);
  const user = users.find(u => u.id === subject);
  if (!user) throw new Error("Your Twitch profile is unavailable. Try reconnecting.");
  async function read(path: string, emptyOn404 = false): Promise<any> {
    const res = await deps.fetch(`https://api.twitch.tv/helix/${path}`, {
      headers: { "Client-Id": deps.env.TWITCH_CLIENT_ID!, Authorization: `Bearer ${await token(deps)}` }, signal: AbortSignal.timeout(5000),
    });
    if (emptyOn404 && res.status === 404) return { data: { segments: [] } };
    if (!res.ok) throw new Error("Twitch could not refresh this section.");
    return res.json();
  }
  const [schedule, history] = await Promise.allSettled([
    read(`schedule?broadcaster_id=${subject}&first=10`, true),
    read(`videos?user_id=${subject}&type=archive&first=10`),
  ]);
  type Entry = import("./account-types").StreamEntry;
  const scheduleRows: Entry[] | undefined = schedule.status === "fulfilled" ? (schedule.value.data?.segments ?? [])
    .filter((s: any) => !s.canceled_until && Number.isFinite(Date.parse(s.start_time)))
    .map((s: any) => ({ id: `twitch-${s.id}`, title: String(s.title || "Twitch stream").slice(0,120), startsAt: s.start_time, url: `https://www.twitch.tv/${user.login}`, source: "twitch" })) : undefined;
  const historyRows: Entry[] | undefined = history.status === "fulfilled" ? (history.value.data ?? [])
    .filter((v: any) => /^\d+$/.test(v.id) && Number.isFinite(Date.parse(v.created_at)))
    .map((v: any) => ({ id: `twitch-${v.id}`, title: String(v.title || "Past broadcast").slice(0,120), startsAt: v.created_at, url: `https://www.twitch.tv/videos/${v.id}`, source: "twitch" })) : undefined;
  return { user, schedule: scheduleRows, history: historyRows, warnings: [
    ...(schedule.status === "rejected" ? ["Schedule refresh failed; showing the last saved schedule."] : []),
    ...(history.status === "rejected" ? ["Past broadcasts refresh failed; showing the last saved broadcasts."] : []),
  ] };
}
