import { createHash, randomBytes, verify as verifySignature, createPublicKey } from "node:crypto";
import { formatUsd } from "@potted/core";
import * as service from "./service";
import { type User, save } from "./store";

/**
 * The `!potted` chat bot on Twitch, Kick and YouTube.
 *
 *   !potted        the open challenge, its pot, and the one-tap link to back it (/j/<handle>)
 *   !potted top    the stream's top planters
 *
 * It also posts in chat when an attempt starts, when a pot reaches its goal,
 * and the result. One core decides what to say; each platform only carries
 * messages in and out:
 *
 * - Twitch: one Potted bot account joins every linked channel over Twitch's
 *   chat connection (TWITCH_BOT_USERNAME, TWITCH_BOT_TOKEN).
 * - Kick: the streamer connects their Kick account (OAuth with PKCE); chat
 *   arrives as signed webhooks and replies go through Kick's chat API.
 * - YouTube: the streamer connects with Google (YouTube permission); while
 *   they are live, the server reads the live chat and replies there.
 */

export type ChatPlatform = "twitch" | "kick" | "youtube";

export interface KickLink {
  broadcasterUserId: number;
  slug: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface YouTubeLink {
  channelTitle: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/** A streamer's chat connections, kept on the user. Tokens never leave the server. */
export interface ChatLinks {
  kick?: KickLink;
  youtube?: YouTubeLink;
}

export function linksOf(streamer: User): ChatLinks {
  return (streamer as User & { chatLinks?: ChatLinks }).chatLinks ?? {};
}

function setLinks(streamer: User, links: ChatLinks): void {
  (streamer as User & { chatLinks?: ChatLinks }).chatLinks = links;
  save();
}

export function botOn(streamer: User): boolean {
  return service.settingsOf(streamer).chatBot !== false;
}

const base = () => (process.env.POTTED_PUBLIC_URL ?? "http://localhost:3000").replace(/\/+$/, "");

// ---------------------------------------------------------------------------
// What the bot says
// ---------------------------------------------------------------------------

/** The bot's answer to a chat message, or undefined when it is not a command for us. */
export function replyTo(streamer: User, text: string, siteBase = base()): string | undefined {
  const words = text.trim().toLowerCase().split(/\s+/);
  if (words[0] !== "!potted" && words[0] !== "!pot") return undefined;
  if (!streamer.handle) return undefined;
  if (words[1] === "top") {
    const top = service.topPlanters(streamer.id, 3);
    if (!top.length) return `No planters yet. Be the first: ${siteBase}/j/${streamer.handle}`;
    return `Top planters: ${top.map((t, i) => `${i + 1}. ${t.name} ${formatUsd(t.amountMicro)}`).join(" · ")}`;
  }
  const open = service
    .stageChallenges(streamer.id)
    .filter((c) => c.status === "open" && c.deadline > Date.now())
    .sort((a, b) => b.totalMicro - a.totalMicro);
  const c = open[0];
  if (!c) return `No challenge is open right now. Suggest one: ${siteBase}/s/${streamer.handle}`;
  const goal = c.goalMicro > 0 ? ` of ${formatUsd(c.goalMicro)}` : "";
  const more = open.length > 1 ? ` (+${open.length - 1} more)` : "";
  return `🌱 ${c.title}: ${formatUsd(c.totalMicro)}${goal} from ${service.fundersOf(c.id).length} planters${more}. Pays only if ${streamer.name} pulls it off. Back it: ${siteBase}/j/${streamer.handle}`;
}

/** Chat messages are short; long titles are cut, links never. */
export function fitChat(text: string, max = 400): string {
  if (text.length <= max) return text;
  const link = text.match(/https?:\/\/\S+$/)?.[0] ?? "";
  return `${text.slice(0, max - link.length - 2).trimEnd()}… ${link}`.trim();
}

// ---------------------------------------------------------------------------
// Announcements, rate-limited per streamer
// ---------------------------------------------------------------------------

const lastSent = new Map<string, number>();
const GAP_MS = 4000;

export type Sender = (platform: ChatPlatform, streamer: User, text: string) => Promise<void>;

let sender: Sender = sendChat;

/** Tests swap the senders for fakes. */
export function useSender(next: Sender): void {
  sender = next;
}

/** The events worth a chat message, and what to say. */
export function announcementFor(type: string, message: string, streamer: User, sfx?: string, siteBase = base()): string | undefined {
  if (type === "locked" || type === "paid" || type === "failed") return fitChat(`🌱 ${message}`);
  if (type === "milestone" && sfx === "goal") return fitChat(`☁️ ${message} ${siteBase}/j/${streamer.handle}`);
  return undefined;
}

/** Posts in every chat the streamer has connected. Never throws; a failed platform is skipped. */
export async function announce(streamer: User, text: string, now = Date.now()): Promise<ChatPlatform[]> {
  if (!botOn(streamer)) return [];
  const last = lastSent.get(streamer.id);
  if (last !== undefined && now - last < GAP_MS) return [];
  lastSent.set(streamer.id, now);
  const sent: ChatPlatform[] = [];
  for (const platform of connectedPlatforms(streamer)) {
    try {
      await sender(platform, streamer, fitChat(text));
      sent.push(platform);
    } catch (error) {
      console.warn(`[chat-bot] ${platform} for ${streamer.handle}:`, error instanceof Error ? error.message : error);
    }
  }
  return sent;
}

export function resetRateLimitForTests(): void {
  lastSent.clear();
}

export function connectedPlatforms(streamer: User): ChatPlatform[] {
  const out: ChatPlatform[] = [];
  if (service.settingsOf(streamer).twitchChannel && twitchBotConfigured()) out.push("twitch");
  const links = linksOf(streamer);
  if (links.kick) out.push("kick");
  if (links.youtube) out.push("youtube");
  return out;
}

/** Sends one message on one platform. */
export async function sendChat(platform: ChatPlatform, streamer: User, text: string, doFetch: typeof fetch = fetch): Promise<void> {
  if (platform === "twitch") return twitch().say(service.settingsOf(streamer).twitchChannel, text);
  if (platform === "kick") return kickSend(streamer, text, doFetch);
  return youtubeSend(streamer, text, doFetch);
}

// ---------------------------------------------------------------------------
// Twitch: one bot account over Twitch's chat connection
// ---------------------------------------------------------------------------

export function twitchBotConfigured(env = process.env): boolean {
  return Boolean(env.TWITCH_BOT_USERNAME && env.TWITCH_BOT_TOKEN);
}

type SocketLike = { send(data: string): void; close(): void; onopen: (() => void) | null; onmessage: ((e: { data: unknown }) => void) | null; onclose: (() => void) | null };

/**
 * A small Twitch chat client: logs in as the bot, joins the linked
 * channels, answers PING, and hands each chat line to `onMessage`.
 */
export class TwitchChat {
  private socket?: SocketLike;
  private joined = new Set<string>();
  private ready = false;
  private queue: string[] = [];

  constructor(
    private readonly username: string,
    private readonly token: string,
    private readonly onMessage: (channel: string, user: string, text: string) => void,
    private readonly open: (url: string) => SocketLike = (url) => new WebSocket(url) as unknown as SocketLike,
  ) {}

  connect(): void {
    const socket = this.open("wss://irc-ws.chat.twitch.tv:443");
    this.socket = socket;
    socket.onopen = () => {
      socket.send(`PASS ${this.token.startsWith("oauth:") ? this.token : `oauth:${this.token}`}`);
      socket.send(`NICK ${this.username.toLowerCase()}`);
      this.ready = true;
      for (const channel of this.joined) socket.send(`JOIN #${channel}`);
      for (const line of this.queue.splice(0)) socket.send(line);
    };
    socket.onmessage = (event) => {
      for (const line of String(event.data).split("\r\n")) this.handle(line);
    };
    socket.onclose = () => {
      this.ready = false;
      // Reconnect after a pause; Twitch closes idle or restarted connections.
      setTimeout(() => this.connect(), 5000).unref?.();
    };
  }

  private handle(line: string): void {
    if (!line) return;
    if (line.startsWith("PING")) {
      this.socket?.send(line.replace("PING", "PONG"));
      return;
    }
    const m = line.match(/^(?:@\S+ )?:(\w+)!\S+ PRIVMSG #(\w+) :(.*)$/);
    if (m) this.onMessage(m[2]!, m[1]!, m[3]!);
  }

  /** Joins exactly these channels, leaving any others. */
  sync(channels: string[]): void {
    const want = new Set(channels.map((c) => c.toLowerCase()));
    for (const c of this.joined) if (!want.has(c)) this.raw(`PART #${c}`);
    for (const c of want) if (!this.joined.has(c)) this.raw(`JOIN #${c}`);
    this.joined = want;
  }

  async say(channel: string, text: string): Promise<void> {
    if (!channel) throw new Error("No Twitch channel linked");
    this.raw(`PRIVMSG #${channel.toLowerCase()} :${text.replace(/[\r\n]+/g, " ")}`);
  }

  private raw(line: string): void {
    if (this.ready && this.socket) this.socket.send(line);
    else this.queue.push(line);
  }
}

const g = globalThis as { __pottedTwitch?: TwitchChat; __pottedBots?: boolean };

function twitch(): TwitchChat {
  if (!g.__pottedTwitch) {
    if (!twitchBotConfigured()) throw new Error("The Twitch bot is not set up (TWITCH_BOT_USERNAME, TWITCH_BOT_TOKEN)");
    g.__pottedTwitch = new TwitchChat(process.env.TWITCH_BOT_USERNAME!, process.env.TWITCH_BOT_TOKEN!, (channel, user, text) => {
      if (user.toLowerCase() === process.env.TWITCH_BOT_USERNAME!.toLowerCase()) return;
      const streamer = service.streamerByChannel("twitch", channel);
      if (!streamer || !botOn(streamer)) return;
      const reply = replyTo(streamer, text);
      if (reply) void g.__pottedTwitch!.say(channel, fitChat(`@${user} ${reply}`));
    });
    g.__pottedTwitch.connect();
  }
  return g.__pottedTwitch;
}

/** The Twitch channels the bot should be in: every linked channel with the bot on. */
export function twitchChannels(): string[] {
  return service
    .listStreamers()
    .filter((s) => botOn(s) && service.settingsOf(s).twitchChannel)
    .map((s) => service.settingsOf(s).twitchChannel);
}

// ---------------------------------------------------------------------------
// Kick: OAuth 2.1 with PKCE, webhooks in, chat API out
// ---------------------------------------------------------------------------

const KICK_ID = "https://id.kick.com";
const KICK_API = "https://api.kick.com/public/v1";
export const KICK_SCOPES = "user:read channel:read chat:write events:subscribe";

export function kickConfigured(env = process.env): boolean {
  return Boolean(env.KICK_CLIENT_ID && env.KICK_CLIENT_SECRET);
}

/** A PKCE pair: the verifier stays in a cookie, the challenge goes to Kick. */
export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function kickAuthorizeUrl(redirectUri: string, state: string, challenge: string): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: process.env.KICK_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    scope: KICK_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${KICK_ID}/oauth/authorize?${q}`;
}

async function kickToken(body: Record<string, string>, doFetch: typeof fetch): Promise<{ accessToken: string; refreshToken: string; expiresAt: number }> {
  const res = await doFetch(`${KICK_ID}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.KICK_CLIENT_ID ?? "", client_secret: process.env.KICK_CLIENT_SECRET ?? "", ...body }),
  });
  const t = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!res.ok || !t.access_token) throw new Error(`Kick did not give a token (${res.status})`);
  return { accessToken: t.access_token, refreshToken: t.refresh_token ?? "", expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 };
}

/** Finishes connecting Kick: swaps the code, finds the channel, and subscribes to its chat. */
export async function connectKick(streamer: User, code: string, verifier: string, redirectUri: string, doFetch: typeof fetch = fetch): Promise<KickLink> {
  if (streamer.role !== "streamer") throw new Error("Only a climber can connect a chat");
  const token = await kickToken({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri }, doFetch);
  const auth = { Authorization: `Bearer ${token.accessToken}` };
  const me = (await (await doFetch(`${KICK_API}/channels`, { headers: auth })).json()) as { data?: { broadcaster_user_id?: number; slug?: string }[] };
  const channel = me.data?.[0];
  if (!channel?.broadcaster_user_id) throw new Error("Kick did not say which channel this is");
  const link: KickLink = { broadcasterUserId: channel.broadcaster_user_id, slug: channel.slug ?? "", ...token };
  const sub = await doFetch(`${KICK_API}/events/subscriptions`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ broadcaster_user_id: link.broadcasterUserId, events: [{ name: "chat.message.sent", version: 1 }], method: "webhook" }),
  });
  if (!sub.ok) throw new Error(`Kick would not send this channel's chat (${sub.status})`);
  setLinks(streamer, { ...linksOf(streamer), kick: link });
  if (link.slug) streamer.settings = { ...service.settingsOf(streamer), kickChannel: link.slug.toLowerCase() };
  save();
  return link;
}

async function kickAccess(streamer: User, doFetch: typeof fetch): Promise<KickLink> {
  const link = linksOf(streamer).kick;
  if (!link) throw new Error("Kick is not connected");
  if (link.expiresAt - Date.now() > 60_000) return link;
  const fresh = { ...link, ...(await kickToken({ grant_type: "refresh_token", refresh_token: link.refreshToken }, doFetch)) };
  setLinks(streamer, { ...linksOf(streamer), kick: fresh });
  return fresh;
}

async function kickSend(streamer: User, text: string, doFetch: typeof fetch): Promise<void> {
  const link = await kickAccess(streamer, doFetch);
  const res = await doFetch(`${KICK_API}/chat`, {
    method: "POST",
    headers: { Authorization: `Bearer ${link.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ broadcaster_user_id: link.broadcasterUserId, content: text.slice(0, 500), type: "bot" }),
  });
  if (!res.ok) throw new Error(`Kick refused the message (${res.status})`);
}

let kickKey: { pem: string; at: number } | undefined;

/** Kick's public key for webhook signatures, fetched and cached for a day. */
async function kickPublicKey(doFetch: typeof fetch): Promise<string> {
  if (process.env.KICK_WEBHOOK_PUBLIC_KEY) return process.env.KICK_WEBHOOK_PUBLIC_KEY;
  if (kickKey && Date.now() - kickKey.at < 86_400_000) return kickKey.pem;
  const res = await doFetch(`${KICK_API}/public-key`);
  const body = (await res.json().catch(() => ({}))) as { data?: { public_key?: string } };
  if (!body.data?.public_key) throw new Error("Could not get Kick's public key");
  kickKey = { pem: body.data.public_key, at: Date.now() };
  return kickKey.pem;
}

/**
 * Checks a Kick webhook: the signature covers "<message id>.<timestamp>.<body>",
 * signed with Kick's key. Works whether the key is RSA (SHA-256) or Ed25519.
 */
export async function verifyKickWebhook(headers: Headers, body: string, doFetch: typeof fetch = fetch): Promise<boolean> {
  const id = headers.get("kick-event-message-id");
  const timestamp = headers.get("kick-event-message-timestamp");
  const signature = headers.get("kick-event-signature");
  if (!id || !timestamp || !signature) return false;
  try {
    const key = createPublicKey(await kickPublicKey(doFetch));
    const data = Buffer.from(`${id}.${timestamp}.${body}`);
    return verifySignature(key.asymmetricKeyType === "ed25519" ? null : "sha256", data, key, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

const seenKick = new Set<string>();

/** One Kick chat event: answers a command for a connected streamer. Kick may deliver twice; each message is handled once. */
export async function handleKickChat(messageId: string, event: { broadcaster?: { user_id?: number }; sender?: { username?: string; user_id?: number }; content?: string }, doFetch: typeof fetch = fetch): Promise<string | undefined> {
  if (seenKick.has(messageId)) return undefined;
  seenKick.add(messageId);
  if (seenKick.size > 5000) seenKick.clear();
  const streamer = service.listStreamers().find((s) => linksOf(s).kick?.broadcasterUserId === event.broadcaster?.user_id);
  if (!streamer || !botOn(streamer)) return undefined;
  const reply = replyTo(streamer, event.content ?? "");
  if (!reply) return undefined;
  const text = fitChat(`@${event.sender?.username ?? "friend"} ${reply}`);
  await kickSend(streamer, text, doFetch);
  return text;
}

// ---------------------------------------------------------------------------
// YouTube: Google OAuth with the YouTube permission, live chat polled while live
// ---------------------------------------------------------------------------

const YT = "https://www.googleapis.com/youtube/v3";
export const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";

export function youtubeConfigured(env = process.env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function youtubeAuthorizeUrl(redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: YOUTUBE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function googleToken(body: Record<string, string>, doFetch: typeof fetch): Promise<{ accessToken: string; refreshToken?: string; expiresAt: number }> {
  const res = await doFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", ...body }),
  });
  const t = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!res.ok || !t.access_token) throw new Error(`Google did not give a token (${res.status})`);
  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 };
}

export async function connectYouTube(streamer: User, code: string, redirectUri: string, doFetch: typeof fetch = fetch): Promise<YouTubeLink> {
  if (streamer.role !== "streamer") throw new Error("Only a climber can connect a chat");
  const token = await googleToken({ grant_type: "authorization_code", code, redirect_uri: redirectUri }, doFetch);
  if (!token.refreshToken) throw new Error("Google did not allow offline access; try connecting again");
  const mine = (await (await doFetch(`${YT}/channels?part=snippet&mine=true`, { headers: { Authorization: `Bearer ${token.accessToken}` } })).json()) as {
    items?: { snippet?: { title?: string; customUrl?: string } }[];
  };
  const snippet = mine.items?.[0]?.snippet;
  if (!snippet) throw new Error("This Google account has no YouTube channel");
  const link: YouTubeLink = { channelTitle: snippet.title ?? "", accessToken: token.accessToken, refreshToken: token.refreshToken, expiresAt: token.expiresAt };
  setLinks(streamer, { ...linksOf(streamer), youtube: link });
  if (snippet.customUrl) streamer.settings = { ...service.settingsOf(streamer), youtubeChannel: snippet.customUrl.replace(/^@/, "").toLowerCase() };
  save();
  return link;
}

async function youtubeAccess(streamer: User, doFetch: typeof fetch): Promise<YouTubeLink> {
  const link = linksOf(streamer).youtube;
  if (!link) throw new Error("YouTube is not connected");
  if (link.expiresAt - Date.now() > 60_000) return link;
  const t = await googleToken({ grant_type: "refresh_token", refresh_token: link.refreshToken }, doFetch);
  const fresh = { ...link, accessToken: t.accessToken, expiresAt: t.expiresAt };
  setLinks(streamer, { ...linksOf(streamer), youtube: fresh });
  return fresh;
}

const ytChats = new Map<string, { liveChatId: string; pageToken?: string; nextAt: number }>();

async function liveChatId(streamer: User, doFetch: typeof fetch): Promise<string | undefined> {
  const link = await youtubeAccess(streamer, doFetch);
  const res = await doFetch(`${YT}/liveBroadcasts?part=snippet&broadcastStatus=active&broadcastType=all`, { headers: { Authorization: `Bearer ${link.accessToken}` } });
  const body = (await res.json().catch(() => ({}))) as { items?: { snippet?: { liveChatId?: string } }[] };
  return body.items?.[0]?.snippet?.liveChatId;
}

async function youtubeSend(streamer: User, text: string, doFetch: typeof fetch): Promise<void> {
  const chat = ytChats.get(streamer.id)?.liveChatId ?? (await liveChatId(streamer, doFetch));
  if (!chat) throw new Error("Not live on YouTube right now");
  const link = await youtubeAccess(streamer, doFetch);
  const res = await doFetch(`${YT}/liveChat/messages?part=snippet`, {
    method: "POST",
    headers: { Authorization: `Bearer ${link.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ snippet: { liveChatId: chat, type: "textMessageEvent", textMessageDetails: { messageText: text.slice(0, 200) } } }),
  });
  if (!res.ok) throw new Error(`YouTube refused the message (${res.status})`);
}

/**
 * One round of reading a streamer's YouTube live chat, at the pace YouTube
 * asks for (at least 8 seconds, to stay inside the daily quota). The first
 * read after going live only notes where chat is, so old messages are not
 * answered. Returns the replies sent.
 */
export async function pollYouTube(streamer: User, now = Date.now(), doFetch: typeof fetch = fetch): Promise<string[]> {
  const state = ytChats.get(streamer.id);
  if (state && now < state.nextAt) return [];
  const id = state?.liveChatId ?? (await liveChatId(streamer, doFetch));
  if (!id) {
    ytChats.delete(streamer.id);
    return [];
  }
  const link = await youtubeAccess(streamer, doFetch);
  const q = new URLSearchParams({ liveChatId: id, part: "snippet,authorDetails", ...(state?.pageToken ? { pageToken: state.pageToken } : {}) });
  const res = await doFetch(`${YT}/liveChat/messages?${q}`, { headers: { Authorization: `Bearer ${link.accessToken}` } });
  if (!res.ok) {
    ytChats.delete(streamer.id);
    return [];
  }
  const body = (await res.json()) as { nextPageToken?: string; pollingIntervalMillis?: number; items?: { snippet?: { displayMessage?: string }; authorDetails?: { displayName?: string; isChatOwner?: boolean } }[] };
  ytChats.set(streamer.id, { liveChatId: id, pageToken: body.nextPageToken, nextAt: now + Math.max(8000, body.pollingIntervalMillis ?? 8000) });
  if (!state) return [];
  const replies: string[] = [];
  for (const item of body.items ?? []) {
    const reply = replyTo(streamer, item.snippet?.displayMessage ?? "");
    if (!reply) continue;
    const text = fitChat(`@${item.authorDetails?.displayName ?? "friend"} ${reply}`, 200);
    await youtubeSend(streamer, text, doFetch);
    replies.push(text);
  }
  return replies;
}

export function resetYouTubeForTests(): void {
  ytChats.clear();
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

/** Starts the Twitch connection and the YouTube readers. Called once when the server starts. */
export function startChatBots(): void {
  if (g.__pottedBots) return;
  g.__pottedBots = true;
  const tick = async () => {
    try {
      if (twitchBotConfigured()) twitch().sync(twitchChannels());
      for (const s of service.listStreamers()) {
        if (linksOf(s).youtube && botOn(s) && service.liveSessionOf(s)?.platform === "youtube") await pollYouTube(s).catch(() => undefined);
      }
    } catch (error) {
      console.warn("[chat-bot]", error instanceof Error ? error.message : error);
    }
  };
  void tick();
  setInterval(tick, 8000).unref?.();
}

/** Forgets a platform's connection. */
export function disconnect(streamer: User, platform: "kick" | "youtube"): void {
  const links = { ...linksOf(streamer) };
  delete links[platform];
  setLinks(streamer, links);
}

/** What the Channel page shows about the bot. */
export function botStatus(streamer: User) {
  const links = linksOf(streamer);
  return {
    on: botOn(streamer),
    twitch: { ready: twitchBotConfigured(), channel: service.settingsOf(streamer).twitchChannel || null },
    kick: { ready: kickConfigured(), connected: links.kick ? links.kick.slug || String(links.kick.broadcasterUserId) : null },
    youtube: { ready: youtubeConfigured(), connected: links.youtube?.channelTitle ?? null },
  };
}
