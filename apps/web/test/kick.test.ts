import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fitKick } from "../src/lib/chat-replies";
import * as kick from "../src/lib/kick";
import * as service from "../src/lib/service";
import { DEMO_GUEST_ID, DEMO_STREAMER_ID, db, resetForTests } from "../src/lib/store";

/**
 * Kick, against stand-ins for Kick's servers. These are mock tests: no real
 * Kick account, webhook delivery or chat was used. See docs/kick.md for the
 * live acceptance steps.
 */

const CHESS = { gameId: "chess", condition: { kind: "lichess", username: "ryan", speed: "bullet" }, goalUsd: 20, pledgeCapUsd: 15, minutes: 30 };
const ryan = () => service.getUser(DEMO_STREAMER_ID)!;
const BROADCASTER = 4242;

type Route = (init: RequestInit, url: string) => Response | Promise<Response>;

/** A fake fetch that answers by URL (longest match first) and records every call. */
function fakeKick(overrides: Record<string, Route> = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  let tokenN = 0;
  const routes: Record<string, Route> = {
    "id.kick.com/oauth/token": () => {
      tokenN++;
      return Response.json({ access_token: `at${tokenN}`, refresh_token: `rt${tokenN}`, expires_in: 7200, scope: kick.KICK_SCOPES, token_type: "Bearer" });
    },
    "id.kick.com/oauth/revoke": () => new Response("OK"),
    "/public/v1/users": () => Response.json({ data: [{ user_id: BROADCASTER, name: "RyanKick", email: "secret@example.com" }] }),
    "/public/v1/channels": () => Response.json({ data: [{ broadcaster_user_id: BROADCASTER, slug: "ryankick", stream_title: "Bullet", stream: { is_live: false } }] }),
    "/public/v1/events/subscriptions": (init) =>
      init.method === "POST"
        ? Response.json({ data: (JSON.parse(String(init.body)).events as { name: string; version: number }[]).map((e) => ({ name: e.name, version: e.version, subscription_id: `sub-${e.name}`, error: "" })) })
        : init.method === "DELETE"
          ? new Response(null, { status: 204 })
          : Response.json({ data: [] }),
    "/public/v1/chat": () => Response.json({ data: { is_sent: true, message_id: crypto.randomUUID() } }),
    ...overrides,
  };
  const f = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const key = Object.keys(routes)
      .filter((k) => url.includes(k))
      .sort((a, b) => b.length - a.length)[0];
    return key ? routes[key]!(init, url) : new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
  return { f, calls, chats: () => calls.filter((c) => c.url.endsWith("/public/v1/chat")).map((c) => JSON.parse(String(c.init.body)) as { content: string; type: string }) };
}

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = publicKey.export({ type: "spki", format: "pem" }).toString();

let seq = 0;
/** Signs a webhook the way Kick does: RSA SHA-256 over "<id>.<timestamp>.<raw body>". */
function signed(type: string, payload: unknown, opts: { id?: string; at?: Date; raw?: string; subscription?: string; key?: typeof privateKey } = {}) {
  const id = opts.id ?? `01HK${String(++seq).padStart(6, "0")}`;
  const timestamp = (opts.at ?? new Date()).toISOString();
  const body = opts.raw ?? JSON.stringify(payload);
  const signature = sign("sha256", Buffer.from(`${id}.${timestamp}.${body}`), opts.key ?? privateKey).toString("base64");
  const headers = new Headers({
    "Kick-Event-Message-Id": id,
    "Kick-Event-Message-Timestamp": timestamp,
    "Kick-Event-Signature": signature,
    "Kick-Event-Type": type,
    "Kick-Event-Version": "1",
    ...(opts.subscription ? { "Kick-Event-Subscription-Id": opts.subscription } : {}),
  });
  return { headers, body, id };
}

const chat = (content: string, sender = { user_id: 7, username: "zoe" }, broadcaster = BROADCASTER) => ({
  message_id: crypto.randomUUID(),
  broadcaster: { user_id: broadcaster, username: "RyanKick", channel_slug: "ryankick" },
  sender,
  content,
  created_at: new Date().toISOString(),
});

async function connect(fetcher = fakeKick()) {
  await kick.connectKick(ryan(), "code1", "verifier1", "https://potted.example/api/connect/kick/callback", fetcher.f);
  return fetcher;
}

let clock = Date.now();
const tick = () => (clock += 2000);

beforeEach(() => {
  resetForTests();
  clock = Date.now();
  kick.resetKickForTests();
  kick.setKickPublicKeyForTests(PEM);
  Object.assign(process.env, { KICK_CLIENT_ID: "kid", KICK_CLIENT_SECRET: "ksecret", POTTED_PUBLIC_URL: "https://potted.example", SESSION_SECRET: "test-session-secret" });
});

afterEach(() => kick.setKickPublicKeyForTests(undefined));

describe("authorization", () => {
  it("uses PKCE S256 with the documented scopes", () => {
    const { challenge } = kick.pkce();
    const url = new URL(kick.kickAuthorizeUrl("https://potted.example/api/connect/kick/callback", "st", challenge));
    expect(url.origin + url.pathname).toBe("https://id.kick.com/oauth/authorize");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("user:read channel:read chat:write events:subscribe");
  });

  it("binds the callback to the state and the climber who pressed Connect", () => {
    const cookie = kick.connectCookie("kick", "abc123", "ver", "u_ryan");
    expect(kick.checkConnectState(cookie, "kick", "abc123", "u_ryan")).toEqual({ verifier: "ver" });
    expect(kick.checkConnectState(cookie, "kick", "abc124", "u_ryan")).toBeUndefined();
    expect(kick.checkConnectState(cookie, "kick", "abc123", "u_someone_else")).toBeUndefined();
    expect(kick.checkConnectState(cookie, "youtube", "abc123", "u_ryan")).toBeUndefined();
    expect(kick.checkConnectState(undefined, "kick", "abc123", "u_ryan")).toBeUndefined();
    expect(kick.checkConnectState(cookie, "kick", null, "u_ryan")).toBeUndefined();
  });

  it("connects: sends the verifier, reads the identity, seals the tokens, subscribes only to what is missing, and posts nothing", async () => {
    const fetcher = fakeKick({
      "/public/v1/events/subscriptions": (init) =>
        init.method === "POST"
          ? Response.json({ data: [{ name: "livestream.status.updated", version: 1, subscription_id: "sub-live", error: "" }] })
          : Response.json({ data: [{ id: "sub-chat", event: "chat.message.sent", version: 1, broadcaster_user_id: BROADCASTER, method: "webhook" }] }),
    });
    await connect(fetcher);
    expect(String(fetcher.calls[0]!.init.body)).toContain("code_verifier=verifier1");
    const post = fetcher.calls.find((c) => c.url.endsWith("/events/subscriptions") && c.init.method === "POST")!;
    expect(JSON.parse(String(post.init.body))).toEqual({ method: "webhook", events: [{ name: "livestream.status.updated", version: 1 }] });
    const link = kick.kickLinkOf(ryan())!;
    expect(link.subscriptions).toEqual([
      { name: "chat.message.sent", version: 1, id: "sub-chat" },
      { name: "livestream.status.updated", version: 1, id: "sub-live" },
    ]);
    expect(service.settingsOf(ryan()).kickChannel).toBe("ryankick");
    expect(fetcher.chats()).toEqual([]);
    // Tokens are stored sealed, never in plain text. The sealed blob is random
    // base64 and can contain "at1"/"rt1" by chance, so check everything else.
    const stored = JSON.stringify(db()).replace(link.tokens!, "<sealed>");
    expect(stored).not.toContain("at1");
    expect(stored).not.toContain("rt1");
    expect(link.tokens).toMatch(/^pbox1:/);
    expect(kick.kickStatus(ryan()).connected).toMatchObject({ slug: "ryankick", name: "RyanKick", live: "offline", commands: true, announce: { started: false, goal: false, result: false } });
  });

  it("will not connect one Kick channel to two Potted accounts", async () => {
    await connect();
    const other = service.getUser(DEMO_GUEST_ID)!;
    await expect(kick.connectKick(other, "c", "v", "u", fakeKick().f)).rejects.toThrow(/another Potted account/);
  });
});

describe("webhook signatures", () => {
  it("accepts Kick's RSA signature over the exact raw bytes only", async () => {
    const { headers, body } = signed("chat.message.sent", { content: "!potted" });
    expect(await kick.verifyKickWebhook(headers, body)).toBe(true);
    expect(await kick.verifyKickWebhook(headers, Buffer.from(body))).toBe(true);
    // Same JSON, different bytes: refused.
    expect(await kick.verifyKickWebhook(headers, JSON.stringify(JSON.parse(body), null, 1))).toBe(false);
    expect(await kick.verifyKickWebhook(headers, body.replace("potted", "pwned"))).toBe(false);
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
    const forged = signed("chat.message.sent", { content: "!potted" }, { key: other });
    expect(await kick.verifyKickWebhook(forged.headers, forged.body)).toBe(false);
    const noSig = new Headers(headers);
    noSig.delete("kick-event-signature");
    expect(await kick.verifyKickWebhook(noSig, body)).toBe(false);
  });

  it("fetches the public key from data.public_key when not overridden", async () => {
    kick.setKickPublicKeyForTests(undefined);
    const fetcher = fakeKick({ "/public/v1/public-key": () => Response.json({ data: { public_key: PEM }, message: "OK" }) });
    const { headers, body } = signed("chat.message.sent", { content: "x" });
    expect(await kick.verifyKickWebhook(headers, body, fetcher.f)).toBe(true);
    expect(await kick.verifyKickWebhook(headers, body, fetcher.f)).toBe(true);
    expect(fetcher.calls.filter((c) => c.url.endsWith("/public-key"))).toHaveLength(1);
  });
});

describe("webhook processing", () => {
  it("answers !potted once, through the outbox, with the bot type and the streamer's own token", async () => {
    const fetcher = await connect();
    const c = await service.createChallenge(ryan(), CHESS);
    const w = signed("chat.message.sent", chat("!potted"), { subscription: "sub-chat.message.sent" });
    const result = await kick.receiveKickWebhook(w.headers, w.body, fetcher.f, clock);
    expect(result).toEqual({ status: 200, body: { ok: true }, queued: true });
    // Saved before Kick is answered.
    expect(db().kickOutbox).toHaveLength(1);
    expect(db().kickSeen?.[w.id]).toBeDefined();
    expect(await kick.drainKickOutbox(fetcher.f, tick)).toBe(1);
    const [msg] = fetcher.chats();
    expect(msg!.type).toBe("bot");
    expect(msg!.content).toMatch(new RegExp(`^@zoe 🌱 ${c.title}.*https://potted\\.example/j/ryan$`));
    const send = fetcher.calls.find((x) => x.url.endsWith("/public/v1/chat"))!;
    expect((send.init.headers as Record<string, string>).Authorization).toBe("Bearer at1");

    // Kick delivers the same message again, even after a restart: success, no second reply.
    kick.resetKickForTests();
    expect(await kick.receiveKickWebhook(w.headers, w.body, fetcher.f, clock)).toMatchObject({ status: 200, queued: false });
    expect(db().kickOutbox).toHaveLength(0);
  });

  it("answers !potted top with public display names only", async () => {
    const fetcher = await connect();
    const c = await service.createChallenge(ryan(), CHESS);
    const ana = await service.signIn("Ana", "fan");
    ana.email = "ana@private.example";
    await service.pledge(ana, c.id, 6);
    const w = signed("chat.message.sent", chat("!potted top"));
    await kick.receiveKickWebhook(w.headers, w.body, fetcher.f, clock);
    await kick.drainKickOutbox(fetcher.f, tick);
    expect(fetcher.chats()[0]!.content).toBe("@zoe Top planters: 1. Ana $6");
    expect(fetcher.chats()[0]!.content).not.toContain("private.example");
  });

  it("keeps channels apart and ignores unknown channels, subscriptions, events and stale deliveries", async () => {
    const fetcher = await connect();
    await service.createChallenge(ryan(), CHESS);
    const wrongChannel = signed("chat.message.sent", chat("!potted", undefined, 9999));
    expect(await kick.receiveKickWebhook(wrongChannel.headers, wrongChannel.body, fetcher.f, clock)).toMatchObject({ status: 200, body: { ignored: "channel" } });
    const wrongSub = signed("chat.message.sent", chat("!potted"), { subscription: "sub-of-someone-else" });
    expect(await kick.receiveKickWebhook(wrongSub.headers, wrongSub.body, fetcher.f, clock)).toMatchObject({ body: { ignored: "subscription" } });
    const follow = signed("channel.followed", { broadcaster: { user_id: BROADCASTER } });
    expect(await kick.receiveKickWebhook(follow.headers, follow.body, fetcher.f, clock)).toMatchObject({ body: { ignored: "event" } });
    const old = signed("chat.message.sent", chat("!potted"), { at: new Date(Date.now() - 2 * 3_600_000) });
    expect(await kick.receiveKickWebhook(old.headers, old.body, fetcher.f)).toMatchObject({ body: { ignored: "stale" } });
    const bad = signed("chat.message.sent", {}, { raw: "{not json" });
    expect((await kick.receiveKickWebhook(bad.headers, bad.body, fetcher.f)).status).toBe(400);
    const unsigned = signed("chat.message.sent", chat("!potted"));
    unsigned.headers.set("kick-event-signature", "AAAA");
    expect((await kick.receiveKickWebhook(unsigned.headers, unsigned.body, fetcher.f)).status).toBe(401);
    expect(db().kickOutbox ?? []).toHaveLength(0);
  });

  it("applies per-channel and per-viewer cooldowns and never answers its own messages", async () => {
    const fetcher = await connect();
    await service.createChallenge(ryan(), CHESS);
    const t0 = Date.now();
    const send = async (content: string, sender = { user_id: 7, username: "zoe" }, at = t0) => {
      const w = signed("chat.message.sent", chat(content, sender));
      return (await kick.receiveKickWebhook(w.headers, w.body, fetcher.f, at)).queued;
    };
    expect(await send("!potted")).toBe(true);
    expect(await send("!potted", { user_id: 8, username: "kai" }, t0 + 5_000)).toBe(false); // channel cooldown
    expect(await send("!potted top", { user_id: 7, username: "zoe" }, t0 + 5_000)).toBe(false); // viewer cooldown
    expect(await send("!potted top", { user_id: 8, username: "kai" }, t0 + 5_000)).toBe(true);
    expect(await send("!potted", { user_id: 8, username: "kai" }, t0 + 40_000)).toBe(true);

    // A message Potted sent comes back as a chat event: ignored.
    kick.resetKickForTests();
    const id = await kick.sendKickMessage(ryan(), "!potted looks like a command", fetcher.f);
    const echo = { ...chat("!potted"), message_id: id };
    const w = signed("chat.message.sent", echo);
    expect((await kick.receiveKickWebhook(w.headers, w.body, fetcher.f, t0 + 100_000)).queued).toBe(false);
  });

  it("records live status from events, and shows unknown when Kick cannot be read", async () => {
    let fail = false;
    const fetcher = await connect(
      fakeKick({
        "/public/v1/channels": () => (fail ? new Response("down", { status: 503 }) : Response.json({ data: [{ broadcaster_user_id: BROADCASTER, slug: "ryankick", stream: { is_live: false } }] })),
      }),
    );
    const now = Date.now();
    const w = signed("livestream.status.updated", { broadcaster: { user_id: BROADCASTER }, is_live: true, title: "Bullet", started_at: new Date().toISOString(), ended_at: null });
    await kick.receiveKickWebhook(w.headers, w.body, fetcher.f, now);
    expect(kick.kickStatus(ryan(), now).connected).toMatchObject({ live: "live", lastEventAt: now });
    fail = true;
    await kick.refreshKickLive(ryan(), fetcher.f, now + 5 * 60_000);
    expect(kick.kickStatus(ryan(), now + 5 * 60_000).connected!.live).toBe("unknown");
  });
});

describe("sending", () => {
  it("refreshes an expiring token once for concurrent sends", async () => {
    const fetcher = await connect();
    kick.kickLinkOf(ryan())!.expiresAt = Date.now() + 10_000;
    await Promise.all([kick.sendKickMessage(ryan(), "a", fetcher.f), kick.sendKickMessage(ryan(), "b", fetcher.f), kick.sendKickMessage(ryan(), "c", fetcher.f)]);
    const refreshes = fetcher.calls.filter((c) => c.url.includes("oauth/token") && String(c.init.body).includes("grant_type=refresh_token"));
    expect(refreshes).toHaveLength(1);
    expect(String(refreshes[0]!.init.body)).toContain("refresh_token=rt1");
    const auths = fetcher.calls.filter((c) => c.url.endsWith("/public/v1/chat")).map((c) => (c.init.headers as Record<string, string>).Authorization);
    expect(auths).toEqual(["Bearer at2", "Bearer at2", "Bearer at2"]);
  });

  it("asks the streamer to reconnect when Kick refuses the refresh token, and stops sending", async () => {
    const fetcher = await connect();
    kick.kickLinkOf(ryan())!.expiresAt = 0;
    const refused = fakeKick({ "id.kick.com/oauth/token": () => Response.json({ error: "invalid_grant" }, { status: 400 }) });
    await expect(kick.sendKickMessage(ryan(), "x", refused.f)).rejects.toThrow();
    expect(kick.kickStatus(ryan()).connected!.needsReconnect).toBe(true);
    expect(fetcher.chats()).toHaveLength(0);
  });

  it("backs off on 429 using Retry-After and sends later", async () => {
    let limited = true;
    const fetcher = await connect(
      fakeKick({
        "/public/v1/chat": () => (limited ? new Response("slow down", { status: 429, headers: { "Retry-After": "7" } }) : Response.json({ data: { is_sent: true, message_id: "m" } })),
      }),
    );
    await service.createChallenge(ryan(), CHESS);
    const t0 = Date.now();
    const w = signed("chat.message.sent", chat("!potted"));
    await kick.receiveKickWebhook(w.headers, w.body, fetcher.f, t0);
    expect(await kick.drainKickOutbox(fetcher.f, () => t0)).toBe(0);
    const [item] = db().kickOutbox!;
    expect(item!.attempts).toBe(1);
    expect(item!.nextAt).toBe(t0 + 7000);
    limited = false;
    expect(await kick.drainKickOutbox(fetcher.f, () => t0 + 3000)).toBe(0);
    expect(await kick.drainKickOutbox(fetcher.f, () => t0 + 7000)).toBe(1);
    expect(db().kickOutbox).toHaveLength(0);
  });

  it("treats is_sent false as not sent", async () => {
    const fetcher = await connect(fakeKick({ "/public/v1/chat": () => Response.json({ data: { is_sent: false } }) }));
    await expect(kick.sendKickMessage(ryan(), "x", fetcher.f)).rejects.toThrow(/did not post/);
  });

  it("fits Kick's 500-grapheme and 2048-byte limits and keeps the link", () => {
    const link = "https://potted.example/j/ryan";
    const long = fitKick(`${"🌱".repeat(800)} ${link}`);
    expect([...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(long)].length).toBeLessThanOrEqual(500);
    expect(Buffer.byteLength(long)).toBeLessThanOrEqual(2048);
    expect(long.endsWith(link)).toBe(true);
    expect(fitKick("short")).toBe("short");
  });
});

describe("announcements", () => {
  it("are off until the streamer turns them on, and are re-checked when sent", async () => {
    const fetcher = await connect();
    expect(kick.queueKickAnnouncement(ryan(), "goal", "☁️ goal!")).toBe(false);
    kick.setKickOptions(ryan(), { announce: { goal: true } });
    expect(kick.queueKickAnnouncement(ryan(), "started", "attempt")).toBe(false);
    expect(kick.queueKickAnnouncement(ryan(), "goal", "☁️ goal!")).toBe(true);
    expect(await kick.drainKickOutbox(fetcher.f, tick)).toBe(1);
    expect(kick.queueKickAnnouncement(ryan(), "goal", "☁️ again")).toBe(true);
    kick.setKickOptions(ryan(), { announce: { goal: false } });
    expect(await kick.drainKickOutbox(fetcher.f, tick)).toBe(0);
    expect(fetcher.chats().map((m) => m.content)).toEqual(["☁️ goal!"]);
  });

  it("stops command replies when the streamer turns commands off before the reply goes out", async () => {
    const fetcher = await connect();
    await service.createChallenge(ryan(), CHESS);
    const w = signed("chat.message.sent", chat("!potted"));
    await kick.receiveKickWebhook(w.headers, w.body, fetcher.f, clock);
    kick.setKickOptions(ryan(), { commands: false });
    expect(await kick.drainKickOutbox(fetcher.f, tick)).toBe(0);
    expect(db().kickOutbox).toHaveLength(0);
  });
});

describe("repair, status and disconnect", () => {
  it("repairs missing subscriptions and reports per-event errors", async () => {
    const fetcher = await connect(
      fakeKick({
        "/public/v1/events/subscriptions": (init) =>
          init.method === "POST"
            ? Response.json({
                data: [
                  { name: "chat.message.sent", version: 1, subscription_id: "s1", error: "" },
                  { name: "livestream.status.updated", version: 1, subscription_id: "", error: "limit reached" },
                ],
              })
            : Response.json({ data: [] }),
      }),
    );
    let status = kick.kickStatus(ryan()).connected!;
    expect(status.subscriptions).toMatchObject({ healthy: false, missing: ["livestream.status.updated"], error: "livestream.status.updated: limit reached" });
    const fixed = fakeKick({
      "/public/v1/events/subscriptions": (init) =>
        init.method === "POST"
          ? Response.json({ data: [{ name: "livestream.status.updated", version: 1, subscription_id: "s2", error: "" }] })
          : Response.json({ data: [{ id: "s1", event: "chat.message.sent", version: 1, broadcaster_user_id: BROADCASTER, method: "webhook" }] }),
    });
    await kick.repairKickSubscriptions(ryan(), fixed.f);
    status = kick.kickStatus(ryan()).connected!;
    expect(status.subscriptions).toMatchObject({ healthy: true, missing: [], error: null });
    expect(fetcher).toBeDefined();
  });

  it("never puts tokens in the status", async () => {
    await connect();
    const text = JSON.stringify(kick.kickStatus(ryan()));
    expect(text).not.toMatch(/at1|rt1|pbox1|secret@example\.com/);
  });

  it("disconnects: drops queued messages, removes subscriptions, revokes tokens, forgets the link", async () => {
    const fetcher = await connect();
    await service.createChallenge(ryan(), CHESS);
    const w = signed("chat.message.sent", chat("!potted"));
    await kick.receiveKickWebhook(w.headers, w.body, fetcher.f, clock);
    expect(db().kickOutbox).toHaveLength(1);
    expect(await kick.disconnectKick(ryan(), fetcher.f)).toEqual({ unsubscribed: true, revoked: true });
    expect(kick.kickLinkOf(ryan())).toBeUndefined();
    expect(db().kickOutbox).toHaveLength(0);
    const del = fetcher.calls.find((c) => c.init.method === "DELETE")!;
    expect(del.url).toContain("id=sub-chat.message.sent&id=sub-livestream.status.updated");
    const revokes = fetcher.calls.filter((c) => c.url.includes("oauth/revoke")).map((c) => new URL(c.url).searchParams.get("token_hint_type"));
    expect(revokes.sort()).toEqual(["access_token", "refresh_token"]);
    expect(await kick.drainKickOutbox(fetcher.f, tick)).toBe(0);
    expect(fetcher.chats()).toHaveLength(0);
    expect(kick.kickStatus(ryan()).connected).toBeNull();
  });

  it("keeps nothing when Kick is disconnected while a token refresh is in flight", async () => {
    await connect();
    kick.kickLinkOf(ryan())!.expiresAt = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = fakeKick({
      "id.kick.com/oauth/token": async () => {
        await gate;
        return Response.json({ access_token: "late", refresh_token: "late-r", expires_in: 7200 });
      },
    });
    const sending = kick.sendKickMessage(ryan(), "x", slow.f);
    await kick.disconnectKick(ryan(), slow.f);
    release();
    await expect(sending).rejects.toThrow();
    expect(kick.kickLinkOf(ryan())).toBeUndefined();
    expect(slow.chats()).toHaveLength(0);
  });
});
