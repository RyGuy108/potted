import { createHash, createPublicKey, randomBytes, randomUUID, timingSafeEqual, verify as verifySignature } from "node:crypto";
import { type AnnouncementKind, botOn, commandOf, fitKick, replyTo } from "./chat-replies";
import { isSealed, open, seal } from "./secret-box";
import * as service from "./service";
import { type User, db, save } from "./store";

/**
 * Kick for the !potted bot, following Kick's official public API
 * (docs.kick.com, api.kick.com/swagger/doc.yaml):
 *
 * - Connect: OAuth 2.1 authorization code with PKCE (S256) and a state bound
 *   to the signed-in Potted streamer. Each streamer's tokens are kept sealed
 *   (AES-256-GCM, see secret-box.ts) on their own account.
 * - In: Kick POSTs chat.message.sent and livestream.status.updated to
 *   /api/webhooks/kick, signed with Kick's RSA key over
 *   "<message id>.<timestamp>.<raw body>". Each accepted event is recorded
 *   before Kick is answered; replies go into a saved outbox.
 * - Out: the outbox sends with that streamer's own token (type "bot"),
 *   paced per channel, backing off on 429, re-checking the connection and
 *   settings at send time.
 *
 * Kick chat and live status are never evidence for a challenge: verifiers
 * and escrow rules decide results.
 */

const KICK_ID = "https://id.kick.com";
const KICK_API = "https://api.kick.com/public/v1";
export const KICK_SCOPES = "user:read channel:read chat:write events:subscribe";
export const KICK_EVENTS = [
  { name: "chat.message.sent", version: 1 },
  { name: "livestream.status.updated", version: 1 },
] as const;

export interface KickLink {
  broadcasterUserId: number;
  slug: string;
  /** The Kick account name that authorized the connection. */
  name?: string;
  /** Access and refresh token, sealed. */
  tokens?: string;
  /** Older connections kept them in plain text; they are sealed on first use. */
  accessToken?: string;
  refreshToken?: string;
  expiresAt: number;
  scopes?: string;
  connectedAt?: number;
  /** Answer !potted in this chat. On unless turned off. */
  commands?: boolean;
  /** Announcements, all off until the streamer turns them on. */
  announce?: Partial<Record<AnnouncementKind, boolean>>;
  subscriptions?: { name: string; version: number; id: string }[];
  subsCheckedAt?: number;
  subsError?: string;
  live?: { isLive: boolean; at: number; title?: string; source: "event" | "api" };
  /** When reading the live status from Kick last failed. */
  liveFailedAt?: number;
  lastEventAt?: number;
  lastSentAt?: number;
  lastError?: { at: number; message: string };
  /** Kick refused our refresh token: the streamer must connect again. */
  needsReconnect?: boolean;
}

export interface KickOutboxItem {
  id: string;
  streamerId: string;
  broadcasterUserId: number;
  kind: "reply" | AnnouncementKind;
  text: string;
  createdAt: number;
  attempts: number;
  nextAt: number;
}

type Fetch = typeof fetch;

export function kickConfigured(env = process.env): boolean {
  return Boolean(env.KICK_CLIENT_ID && env.KICK_CLIENT_SECRET);
}

// ---------------------------------------------------------------------------
// The link on the streamer's account
// ---------------------------------------------------------------------------

type WithLinks = User & { chatLinks?: { kick?: KickLink; [k: string]: unknown } };

export function kickLinkOf(streamer: User): KickLink | undefined {
  return (streamer as WithLinks).chatLinks?.kick;
}

function setKickLink(streamer: User, link: KickLink | undefined): void {
  const s = streamer as WithLinks;
  const links = { ...(s.chatLinks ?? {}) };
  if (link) links.kick = link;
  else delete links.kick;
  s.chatLinks = links;
  save();
}

function updateLink(streamer: User, change: Partial<KickLink>): KickLink | undefined {
  const link = kickLinkOf(streamer);
  if (!link) return undefined;
  const next = { ...link, ...change };
  setKickLink(streamer, next);
  return next;
}

function aad(link: Pick<KickLink, "broadcasterUserId">, streamer: User): string {
  return `kick:${streamer.id}:${link.broadcasterUserId}`;
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

function readTokens(streamer: User, link: KickLink): Tokens {
  if (link.tokens) return JSON.parse(open(link.tokens, aad(link, streamer))) as Tokens;
  if (link.accessToken) {
    // An older, unsealed connection: seal it now.
    const tokens = { accessToken: link.accessToken, refreshToken: link.refreshToken ?? "" };
    const { accessToken: _a, refreshToken: _r, ...rest } = link;
    setKickLink(streamer, { ...rest, tokens: seal(JSON.stringify(tokens), aad(link, streamer)) });
    return tokens;
  }
  throw new Error("Kick is not connected");
}

function sealTokens(streamer: User, link: Pick<KickLink, "broadcasterUserId">, tokens: Tokens): string {
  return seal(JSON.stringify(tokens), aad(link, streamer));
}

export function streamerByKickBroadcaster(broadcasterUserId: number): User | undefined {
  return service.listStreamers().find((s) => kickLinkOf(s)?.broadcasterUserId === broadcasterUserId);
}

// ---------------------------------------------------------------------------
// Connecting
// ---------------------------------------------------------------------------

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

/** The cookie that carries a connect attempt: platform, state, PKCE verifier, and the Potted user who started it. */
export function connectCookie(platform: string, state: string, verifier: string, userId: string): string {
  return [platform, state, verifier, userId].join(":");
}

/**
 * Whether the callback belongs to the attempt in the cookie: same platform,
 * same state, and the same signed-in Potted user who pressed Connect.
 */
export function checkConnectState(cookie: string | undefined, platform: string, state: string | null, userId: string | undefined): { verifier: string } | undefined {
  const [saved, savedState, verifier, savedUser] = (cookie ?? "").split(":");
  if (!saved || !savedState || !state || !userId || saved !== platform || savedUser !== userId) return undefined;
  const a = Buffer.from(savedState);
  const b = Buffer.from(state);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined;
  return { verifier: verifier ?? "" };
}

class KickHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

async function kickToken(body: Record<string, string>, doFetch: Fetch): Promise<Tokens & { expiresAt: number; scopes?: string }> {
  const res = await doFetch(`${KICK_ID}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.KICK_CLIENT_ID ?? "", client_secret: process.env.KICK_CLIENT_SECRET ?? "", ...body }),
  });
  const t = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number | string; scope?: string };
  if (!res.ok || !t.access_token) throw new KickHttpError(`Kick did not give a token (${res.status})`, res.status);
  const seconds = Number(t.expires_in) > 0 ? Number(t.expires_in) : 3600;
  return { accessToken: t.access_token, refreshToken: t.refresh_token ?? body.refresh_token ?? "", expiresAt: Date.now() + seconds * 1000, scopes: t.scope };
}

async function kickJson<T>(doFetch: Fetch, url: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await doFetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers as Record<string, string>) } });
  if (!res.ok) {
    const retry = Number(res.headers.get("retry-after"));
    throw new KickHttpError(`Kick said ${res.status} for ${new URL(url).pathname}`, res.status, Number.isFinite(retry) && retry > 0 ? retry * 1000 : undefined);
  }
  if (res.status === 204) return {} as T;
  return (await res.json().catch(() => ({}))) as T;
}

/**
 * Finishes connecting Kick: swaps the code, reads who authorized and their
 * channel, keeps the tokens sealed on this streamer, then subscribes to the
 * channel's events. Never posts in chat.
 */
export async function connectKick(streamer: User, code: string, verifier: string, redirectUri: string, doFetch: Fetch = fetch): Promise<KickLink> {
  if (streamer.role !== "streamer") throw new Error("Only a climber can connect a chat");
  const token = await kickToken({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri }, doFetch);
  const users = await kickJson<{ data?: { user_id?: number; name?: string }[] }>(doFetch, `${KICK_API}/users`, token.accessToken);
  const channels = await kickJson<{ data?: { broadcaster_user_id?: number; slug?: string; stream_title?: string; stream?: { is_live?: boolean } }[] }>(doFetch, `${KICK_API}/channels`, token.accessToken);
  const channel = channels.data?.[0];
  if (!channel?.broadcaster_user_id) throw new Error("Kick did not say which channel this is");
  const owner = streamerByKickBroadcaster(channel.broadcaster_user_id);
  if (owner && owner.id !== streamer.id) throw new Error("That Kick channel is already connected to another Potted account");
  const previous = kickLinkOf(streamer);
  const same = previous?.broadcasterUserId === channel.broadcaster_user_id;
  const link: KickLink = {
    broadcasterUserId: channel.broadcaster_user_id,
    slug: channel.slug ?? "",
    name: users.data?.[0]?.name,
    tokens: sealTokens(streamer, { broadcasterUserId: channel.broadcaster_user_id }, token),
    expiresAt: token.expiresAt,
    scopes: token.scopes ?? KICK_SCOPES,
    connectedAt: Date.now(),
    commands: same ? previous?.commands : true,
    announce: same ? previous?.announce : {},
    subscriptions: same ? previous?.subscriptions : [],
    live: typeof channel.stream?.is_live === "boolean" ? { isLive: channel.stream.is_live, at: Date.now(), title: channel.stream_title, source: "api" } : undefined,
  };
  setKickLink(streamer, link);
  if (link.slug) streamer.settings = { ...service.settingsOf(streamer), kickChannel: link.slug.toLowerCase() };
  save();
  await repairKickSubscriptions(streamer, doFetch).catch(() => undefined);
  return kickLinkOf(streamer)!;
}

// ---------------------------------------------------------------------------
// Tokens: refreshed once at a time per streamer
// ---------------------------------------------------------------------------

const refreshing = new Map<string, Promise<string>>();

/** A usable access token, refreshing it when it is about to expire (or `force`). Concurrent callers share one refresh. */
export async function kickAccessToken(streamer: User, doFetch: Fetch = fetch, force = false): Promise<string> {
  const link = kickLinkOf(streamer);
  if (!link) throw new Error("Kick is not connected");
  if (link.needsReconnect) throw new Error("Kick needs to be connected again");
  const tokens = readTokens(streamer, link);
  if (!force && link.expiresAt - Date.now() > 60_000) return tokens.accessToken;
  const running = refreshing.get(streamer.id);
  if (running) return running;
  const job = (async () => {
    try {
      const fresh = await kickToken({ grant_type: "refresh_token", refresh_token: tokens.refreshToken }, doFetch);
      const current = kickLinkOf(streamer);
      // Disconnected (or reconnected to another channel) while refreshing: keep nothing.
      if (!current || current.broadcasterUserId !== link.broadcasterUserId) throw new Error("Kick was disconnected");
      updateLink(streamer, { tokens: sealTokens(streamer, current, fresh), expiresAt: fresh.expiresAt, scopes: fresh.scopes ?? current.scopes, needsReconnect: false });
      return fresh.accessToken;
    } catch (error) {
      if (error instanceof KickHttpError && (error.status === 400 || error.status === 401)) {
        updateLink(streamer, { needsReconnect: true, lastError: { at: Date.now(), message: "Kick ended the connection. Reconnect Kick." } });
      }
      throw error;
    } finally {
      refreshing.delete(streamer.id);
    }
  })();
  refreshing.set(streamer.id, job);
  return job;
}

/** Calls Kick with the streamer's token, refreshing once if Kick says the token is no longer good. */
async function withToken<T>(streamer: User, doFetch: Fetch, call: (token: string) => Promise<T>): Promise<T> {
  try {
    return await call(await kickAccessToken(streamer, doFetch));
  } catch (error) {
    if (!(error instanceof KickHttpError) || error.status !== 401) throw error;
    return call(await kickAccessToken(streamer, doFetch, true));
  }
}

// ---------------------------------------------------------------------------
// Event subscriptions
// ---------------------------------------------------------------------------

/** Makes sure this channel's chat and live-status events come to Potted. Creates only the missing ones. */
export async function repairKickSubscriptions(streamer: User, doFetch: Fetch = fetch): Promise<KickLink | undefined> {
  const link = kickLinkOf(streamer);
  if (!link) throw new Error("Kick is not connected");
  try {
    const result = await withToken(streamer, doFetch, async (token) => {
      const listed = await kickJson<{ data?: { id: string; event: string; version: number; broadcaster_user_id: number; method: string }[] }>(
        doFetch,
        `${KICK_API}/events/subscriptions?broadcaster_user_id=${link.broadcasterUserId}`,
        token,
      );
      const have = (listed.data ?? []).filter((s) => s.broadcaster_user_id === link.broadcasterUserId && s.method === "webhook");
      const kept: { name: string; version: number; id: string }[] = KICK_EVENTS.flatMap((e) => {
        const found = have.find((s) => s.event === e.name && s.version === e.version);
        return found ? [{ name: e.name, version: e.version, id: found.id }] : [];
      });
      const missing = KICK_EVENTS.filter((e) => !kept.some((k) => k.name === e.name));
      const errors: string[] = [];
      if (missing.length) {
        const made = await kickJson<{ data?: { name: string; version: number; subscription_id?: string; error?: string }[] }>(doFetch, `${KICK_API}/events/subscriptions`, token, {
          method: "POST",
          // With a user token Kick takes the channel from the token.
          body: JSON.stringify({ method: "webhook", events: missing }),
        });
        for (const row of made.data ?? []) {
          if (row.error || !row.subscription_id) errors.push(`${row.name}: ${row.error || "not created"}`);
          else kept.push({ name: row.name, version: row.version, id: row.subscription_id });
        }
        for (const e of missing) if (!(made.data ?? []).some((r) => r.name === e.name)) errors.push(`${e.name}: no answer`);
      }
      return { kept, errors };
    });
    return updateLink(streamer, { subscriptions: result.kept, subsCheckedAt: Date.now(), subsError: result.errors.length ? result.errors.join("; ") : undefined });
  } catch (error) {
    updateLink(streamer, { subsCheckedAt: Date.now(), subsError: error instanceof Error ? error.message : "Could not check subscriptions" });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

let kickKey: { pem: string; at: number } | undefined;
let keyOverride: string | undefined;

/** Tests sign with their own key. */
export function setKickPublicKeyForTests(pem: string | undefined): void {
  keyOverride = pem;
  kickKey = undefined;
}

async function kickPublicKey(doFetch: Fetch, fresh = false): Promise<string> {
  if (keyOverride) return keyOverride;
  if (!fresh && kickKey && Date.now() - kickKey.at < 6 * 3_600_000) return kickKey.pem;
  const res = await doFetch(`${KICK_API}/public-key`);
  const text = await res.text();
  let pem = text;
  try {
    pem = (JSON.parse(text) as { data?: { public_key?: string } }).data?.public_key ?? "";
  } catch {
    // Served as plain PEM.
  }
  if (!res.ok || !pem.includes("PUBLIC KEY")) throw new Error("Could not get Kick's public key");
  kickKey = { pem, at: Date.now() };
  return pem;
}

function checkSignature(pem: string, data: Buffer, signature: string): boolean {
  try {
    const key = createPublicKey(pem);
    if (key.asymmetricKeyType !== "rsa") return false;
    return verifySignature("sha256", data, key, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

/**
 * Checks Kick-Event-Signature: RSA PKCS#1 v1.5 with SHA-256 over the exact
 * bytes "<message id>.<timestamp>.<raw body>". On a mismatch with a cached
 * key, fetches the key once more in case Kick rotated it.
 */
export async function verifyKickWebhook(headers: Headers, rawBody: string | Buffer, doFetch: Fetch = fetch): Promise<boolean> {
  const id = headers.get("kick-event-message-id");
  const timestamp = headers.get("kick-event-message-timestamp");
  const signature = headers.get("kick-event-signature");
  if (!id || !timestamp || !signature) return false;
  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  const data = Buffer.concat([Buffer.from(`${id}.${timestamp}.`, "utf8"), body]);
  try {
    if (checkSignature(await kickPublicKey(doFetch), data, signature)) return true;
    if (keyOverride || !kickKey || Date.now() - kickKey.at < 60_000) return false;
    return checkSignature(await kickPublicKey(doFetch, true), data, signature);
  } catch {
    return false;
  }
}

/** Events older than this are acknowledged but not acted on; Kick's retries come well inside it. */
export const REPLAY_WINDOW_MS = 60 * 60_000;
const FUTURE_SKEW_MS = 5 * 60_000;
/** Accepted message ids are kept longer than the replay window, so a late duplicate is still caught. */
const SEEN_KEEP_MS = 3 * 60 * 60_000;

function seen(): Record<string, number> {
  return (db().kickSeen ??= {});
}

function remember(messageId: string, now: number): void {
  const s = seen();
  s[messageId] = now;
  const ids = Object.keys(s);
  if (ids.length > 500) for (const id of ids) if (now - s[id]! > SEEN_KEEP_MS) delete s[id];
}

export interface WebhookResult {
  status: number;
  body: { ok?: true; ignored?: string; error?: string };
  /** Whether something went into the outbox. */
  queued: boolean;
}

interface ChatEvent {
  message_id?: string;
  broadcaster?: { user_id?: number };
  sender?: { user_id?: number; username?: string };
  content?: string;
}

interface LiveEvent {
  broadcaster?: { user_id?: number };
  is_live?: boolean;
  title?: string;
}

// Commands answered at most once per channel per 15 s, and once per viewer per 30 s.
const COMMAND_GAP_MS = 15_000;
const VIEWER_GAP_MS = 30_000;
const lastCommand = new Map<string, number>();
/** Ids of messages Potted sent, so they are never treated as commands. */
const sentIds = new Set<string>();

/**
 * One Kick webhook, after reading the raw body. Verifies, deduplicates,
 * routes to the streamer by broadcaster, and saves what to do before
 * returning; the caller answers Kick with the result and then drains the
 * outbox.
 */
export async function receiveKickWebhook(headers: Headers, rawBody: string | Buffer, doFetch: Fetch = fetch, now = Date.now()): Promise<WebhookResult> {
  const ignore = (why: string): WebhookResult => ({ status: 200, body: { ignored: why }, queued: false });
  if (!(await verifyKickWebhook(headers, rawBody, doFetch))) return { status: 401, body: { error: "Bad signature" }, queued: false };
  const messageId = headers.get("kick-event-message-id")!;
  const type = headers.get("kick-event-type") ?? "";
  const version = headers.get("kick-event-version") ?? "";
  const sentAt = Date.parse(headers.get("kick-event-message-timestamp") ?? "");
  if (!Number.isFinite(sentAt)) return { status: 400, body: { error: "Bad timestamp" }, queued: false };
  if (!KICK_EVENTS.some((e) => e.name === type && String(e.version) === version)) return ignore("event");
  if (now - sentAt > REPLAY_WINDOW_MS || sentAt - now > FUTURE_SKEW_MS) return ignore("stale");
  if (seen()[messageId]) return { status: 200, body: { ok: true }, queued: false };

  let event: ChatEvent & LiveEvent;
  try {
    event = JSON.parse(typeof rawBody === "string" ? rawBody : rawBody.toString("utf8"));
  } catch {
    return { status: 400, body: { error: "Body is not JSON" }, queued: false };
  }
  const broadcaster = event?.broadcaster?.user_id;
  if (typeof broadcaster !== "number") return { status: 400, body: { error: "No broadcaster" }, queued: false };

  remember(messageId, now);
  const streamer = streamerByKickBroadcaster(broadcaster);
  const link = streamer && kickLinkOf(streamer);
  if (!streamer || !link) {
    save();
    return ignore("channel");
  }
  const subscription = headers.get("kick-event-subscription-id");
  if (subscription && link.subscriptions?.length && !link.subscriptions.some((s) => s.id === subscription)) {
    save();
    return ignore("subscription");
  }

  let queued = false;
  if (type === "livestream.status.updated") {
    if (typeof event.is_live === "boolean") updateLink(streamer, { lastEventAt: now, live: { isLive: event.is_live, at: now, title: event.title, source: "event" } });
  } else {
    updateLink(streamer, { lastEventAt: now });
    queued = queueCommandReply(streamer, link, event, now);
  }
  save();
  return { status: 200, body: { ok: true }, queued };
}

function queueCommandReply(streamer: User, link: KickLink, event: ChatEvent, now: number): boolean {
  if (event.message_id && sentIds.has(event.message_id)) return false;
  const command = commandOf(event.content ?? "");
  if (!command || link.commands === false || !botOn(streamer) || link.needsReconnect) return false;
  const channelKey = `${link.broadcasterUserId}:${command}`;
  const viewerKey = `${link.broadcasterUserId}:u${event.sender?.user_id ?? event.sender?.username ?? "?"}`;
  if (now - (lastCommand.get(channelKey) ?? -Infinity) < COMMAND_GAP_MS) return false;
  if (now - (lastCommand.get(viewerKey) ?? -Infinity) < VIEWER_GAP_MS) return false;
  const reply = replyTo(streamer, event.content ?? "");
  if (!reply) return false;
  lastCommand.set(channelKey, now);
  lastCommand.set(viewerKey, now);
  enqueue(streamer, link, "reply", `@${event.sender?.username ?? "friend"} ${reply}`, now);
  return true;
}

// ---------------------------------------------------------------------------
// The outbox
// ---------------------------------------------------------------------------

function outbox(): KickOutboxItem[] {
  return (db().kickOutbox ??= []);
}

function enqueue(streamer: User, link: KickLink, kind: KickOutboxItem["kind"], text: string, now: number): void {
  const box = outbox();
  box.push({ id: randomUUID(), streamerId: streamer.id, broadcasterUserId: link.broadcasterUserId, kind, text: fitKick(text), createdAt: now, attempts: 0, nextAt: now });
  // Never let a flood grow without bound: keep the newest 200.
  if (box.length > 200) box.splice(0, box.length - 200);
}

/** Queues an announcement if the streamer turned that kind on. Returns whether it was queued. */
export function queueKickAnnouncement(streamer: User, kind: AnnouncementKind, text: string, now = Date.now()): boolean {
  const link = kickLinkOf(streamer);
  if (!link || link.needsReconnect || !link.announce?.[kind] || !botOn(streamer)) return false;
  enqueue(streamer, link, kind, text, now);
  save();
  return true;
}

/** A reply nobody is waiting for any more is dropped rather than sent late. */
const MAX_AGE_MS = { reply: 2 * 60_000, announce: 10 * 60_000 };
const MAX_ATTEMPTS = 6;
/** At least this long between two messages in one channel. */
export const CHANNEL_GAP_MS = 1500;
const lastChannelSend = new Map<number, number>();

/** Whether a queued message may still go out, checked when it is about to be sent. */
function stillWanted(item: KickOutboxItem, now: number): User | undefined {
  const streamer = service.getUser(item.streamerId);
  const link = streamer && kickLinkOf(streamer);
  if (!streamer || !link || link.broadcasterUserId !== item.broadcasterUserId || link.needsReconnect || !botOn(streamer)) return undefined;
  if (item.kind === "reply" ? link.commands === false : !link.announce?.[item.kind]) return undefined;
  if (now - item.createdAt > (item.kind === "reply" ? MAX_AGE_MS.reply : MAX_AGE_MS.announce)) return undefined;
  return streamer;
}

/** Posts one message with the streamer's own token. Kick picks the channel from the token for "bot" messages. */
export async function sendKickMessage(streamer: User, text: string, doFetch: Fetch = fetch): Promise<string | undefined> {
  const link = kickLinkOf(streamer);
  if (!link) throw new Error("Kick is not connected");
  const body = await withToken(streamer, doFetch, (token) =>
    kickJson<{ data?: { is_sent?: boolean; message_id?: string } }>(doFetch, `${KICK_API}/chat`, token, {
      method: "POST",
      body: JSON.stringify({ type: "bot", content: fitKick(text), broadcaster_user_id: link.broadcasterUserId }),
    }),
  );
  if (!body.data?.is_sent) throw new KickHttpError("Kick did not post the message", 422);
  if (body.data.message_id) {
    sentIds.add(body.data.message_id);
    if (sentIds.size > 1000) sentIds.clear();
  }
  updateLink(streamer, { lastSentAt: Date.now(), lastError: undefined });
  return body.data.message_id;
}

let draining: Promise<number> | undefined;

/** Sends what is due in the outbox, one at a time. Returns how many were sent. Safe to call often. */
export function drainKickOutbox(doFetch: Fetch = fetch, now: () => number = Date.now): Promise<number> {
  if (draining) return draining;
  draining = (async () => {
    let sent = 0;
    // Yield first, so `draining` is set before the finally below clears it.
    await Promise.resolve();
    try {
      for (const item of [...outbox()]) {
        const t = now();
        if (item.nextAt > t) continue;
        if (!outbox().includes(item)) continue;
        const streamer = stillWanted(item, t);
        if (!streamer) {
          drop(item);
          continue;
        }
        const last = lastChannelSend.get(item.broadcasterUserId) ?? -Infinity;
        if (t - last < CHANNEL_GAP_MS) {
          item.nextAt = last + CHANNEL_GAP_MS;
          continue;
        }
        lastChannelSend.set(item.broadcasterUserId, t);
        try {
          // The connection or settings may have changed while waiting.
          if (!stillWanted(item, now())) {
            drop(item);
            continue;
          }
          await sendKickMessage(streamer, item.text, doFetch);
          drop(item);
          sent++;
        } catch (error) {
          item.attempts++;
          const status = error instanceof KickHttpError ? error.status : 0;
          const message = error instanceof Error ? error.message : "Kick send failed";
          updateLink(streamer, { lastError: { at: now(), message } });
          const permanent = status === 400 || status === 401 || status === 403 || status === 422 || item.attempts >= MAX_ATTEMPTS || kickLinkOf(streamer)?.needsReconnect;
          if (permanent) drop(item);
          else item.nextAt = now() + ((error instanceof KickHttpError && error.retryAfterMs) || Math.min(300_000, 2000 * 2 ** item.attempts));
          console.warn(`[kick] send for ${streamer.handle}: ${message}`);
        }
      }
    } finally {
      save();
      draining = undefined;
    }
    return sent;
  })();
  return draining;
}

function drop(item: KickOutboxItem): void {
  const box = outbox();
  const i = box.indexOf(item);
  if (i >= 0) box.splice(i, 1);
}

// ---------------------------------------------------------------------------
// Live status
// ---------------------------------------------------------------------------

const LIVE_FRESH_MS = 2 * 60_000;
const LIVE_STALE_MS = 15 * 60_000;

/** Reads the channel's live state from Kick when what we have is older than two minutes. Never throws. */
export async function refreshKickLive(streamer: User, doFetch: Fetch = fetch, now = Date.now()): Promise<void> {
  const link = kickLinkOf(streamer);
  if (!link || link.needsReconnect) return;
  if (link.live && now - link.live.at < LIVE_FRESH_MS && !(link.liveFailedAt && link.liveFailedAt > link.live.at)) return;
  if (link.liveFailedAt && now - link.liveFailedAt < 30_000) return;
  try {
    const body = await withToken(streamer, doFetch, (token) =>
      kickJson<{ data?: { broadcaster_user_id?: number; stream_title?: string; stream?: { is_live?: boolean } }[] }>(doFetch, `${KICK_API}/channels?broadcaster_user_id=${link.broadcasterUserId}`, token),
    );
    const channel = body.data?.find((c) => c.broadcaster_user_id === link.broadcasterUserId);
    if (typeof channel?.stream?.is_live !== "boolean") throw new Error("No live state");
    updateLink(streamer, { live: { isLive: channel.stream.is_live, at: now, title: channel.stream_title, source: "api" } });
  } catch {
    updateLink(streamer, { liveFailedAt: now });
  }
}

export function liveState(link: KickLink, now = Date.now()): "live" | "offline" | "unknown" {
  const live = link.live;
  if (!live || (link.liveFailedAt && link.liveFailedAt > live.at) || now - live.at > LIVE_STALE_MS) return "unknown";
  return live.isLive ? "live" : "offline";
}

// ---------------------------------------------------------------------------
// Management, for the Channel page (owner only: callers pass the signed-in user)
// ---------------------------------------------------------------------------

export function setKickOptions(streamer: User, change: { commands?: boolean; announce?: Partial<Record<AnnouncementKind, boolean>> }): void {
  const link = kickLinkOf(streamer);
  if (!link) throw new Error("Kick is not connected");
  const announce = { ...link.announce };
  for (const kind of ["started", "goal", "result"] as const) if (typeof change.announce?.[kind] === "boolean") announce[kind] = change.announce[kind];
  updateLink(streamer, { ...(typeof change.commands === "boolean" ? { commands: change.commands } : {}), announce });
}

/**
 * Disconnects Kick: forgets the connection and anything queued first (so
 * nothing more is sent), then removes the event subscriptions and revokes
 * the tokens at Kick where it can.
 */
export async function disconnectKick(streamer: User, doFetch: Fetch = fetch): Promise<{ unsubscribed: boolean; revoked: boolean }> {
  const link = kickLinkOf(streamer);
  if (!link) return { unsubscribed: true, revoked: true };
  let tokens: Tokens | undefined;
  try {
    tokens = readTokens(streamer, link);
  } catch {
    tokens = undefined;
  }
  db().kickOutbox = outbox().filter((i) => i.streamerId !== streamer.id);
  setKickLink(streamer, undefined);
  refreshing.delete(streamer.id);
  let unsubscribed = false;
  let revoked = false;
  if (tokens) {
    try {
      let ids = (link.subscriptions ?? []).map((s) => s.id);
      if (!ids.length) {
        const listed = await kickJson<{ data?: { id: string; broadcaster_user_id: number }[] }>(doFetch, `${KICK_API}/events/subscriptions?broadcaster_user_id=${link.broadcasterUserId}`, tokens.accessToken);
        ids = (listed.data ?? []).filter((s) => s.broadcaster_user_id === link.broadcasterUserId).map((s) => s.id);
      }
      if (ids.length) await kickJson(doFetch, `${KICK_API}/events/subscriptions?${ids.map((id) => `id=${encodeURIComponent(id)}`).join("&")}`, tokens.accessToken, { method: "DELETE" });
      unsubscribed = true;
    } catch {
      unsubscribed = false;
    }
    const results = await Promise.all(
      [
        [tokens.accessToken, "access_token"],
        [tokens.refreshToken, "refresh_token"],
      ]
        .filter(([t]) => t)
        .map(async ([token, hint]) => {
          try {
            const res = await doFetch(`${KICK_ID}/oauth/revoke?${new URLSearchParams({ token: token!, token_hint_type: hint! })}`, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
            });
            return res.ok;
          } catch {
            return false;
          }
        }),
    );
    revoked = results.length > 0 && results.every(Boolean);
  }
  save();
  return { unsubscribed, revoked };
}

/** What the Channel page shows. Never includes tokens. */
export function kickStatus(streamer: User, now = Date.now()) {
  const link = kickLinkOf(streamer);
  const configured = kickConfigured();
  if (!link) return { configured, connected: null };
  const subscribed = new Set((link.subscriptions ?? []).map((s) => s.name));
  const missing = KICK_EVENTS.map((e) => e.name).filter((n) => !subscribed.has(n));
  const scopes = new Set((link.scopes ?? "").split(/\s+/));
  return {
    configured,
    connected: {
      slug: link.slug,
      name: link.name ?? null,
      url: link.slug ? `https://kick.com/${link.slug}` : null,
      live: liveState(link, now),
      liveCheckedAt: link.live?.at ?? null,
      commands: link.commands !== false,
      announce: { started: Boolean(link.announce?.started), goal: Boolean(link.announce?.goal), result: Boolean(link.announce?.result) },
      subscriptions: { healthy: missing.length === 0 && !link.subsError, missing, checkedAt: link.subsCheckedAt ?? null, error: link.subsError ?? null },
      lastEventAt: link.lastEventAt ?? null,
      lastSentAt: link.lastSentAt ?? null,
      lastError: link.lastError ?? null,
      needsReconnect: Boolean(link.needsReconnect),
      missingScopes: KICK_SCOPES.split(" ").filter((s) => !scopes.has(s)),
      queued: outbox().filter((i) => i.streamerId === streamer.id).length,
    },
  };
}

export type KickStatus = ReturnType<typeof kickStatus>;

export function resetKickForTests(): void {
  lastCommand.clear();
  lastChannelSend.clear();
  sentIds.clear();
  refreshing.clear();
  kickKey = undefined;
  draining = undefined;
}
