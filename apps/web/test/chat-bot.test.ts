import { generateKeyPairSync, sign } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import * as bot from "../src/lib/chat-bot";
import * as service from "../src/lib/service";
import { DEMO_STREAMER_ID, resetForTests } from "../src/lib/store";

const CHESS = { gameId: "chess", condition: { kind: "lichess", username: "ryan", speed: "bullet" }, goalUsd: 20, pledgeCapUsd: 15, minutes: 30 };
const ryan = () => service.getUser(DEMO_STREAMER_ID)!;

/** A fake fetch that answers by URL and records every call. */
function fakeFetch(routes: Record<string, (init: RequestInit) => Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.includes(k));
    return key ? routes[key]!(init) : new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

beforeEach(() => {
  resetForTests();
  bot.resetRateLimitForTests();
  bot.resetYouTubeForTests();
  process.env.POTTED_PUBLIC_URL = "https://potted.example";
});

describe("what the bot says", () => {
  it("answers !potted with the open challenge and the one-tap link, and !potted top with the leaders", async () => {
    expect(bot.replyTo(ryan(), "hello")).toBeUndefined();
    const c = await service.createChallenge(ryan(), CHESS);
    const ana = await service.signIn("Ana", "fan");
    await service.pledge(ana, c.id, 6);
    expect(bot.replyTo(ryan(), "!potted")).toBe(`🌱 ${c.title}: $6 of $20 from 1 planters. Pays only if Ryan pulls it off. Back it: https://potted.example/j/ryan`);
    expect(bot.replyTo(ryan(), "!POTTED top")).toBe("Top planters: 1. Ana $6");
    expect(bot.fitChat(`${"x".repeat(500)} https://potted.example/j/ryan`, 100).endsWith("https://potted.example/j/ryan")).toBe(true);
  });
});

describe("Twitch", () => {
  it("logs in, joins linked channels, answers PING and hands chat lines over", () => {
    const sent: string[] = [];
    const socket = { send: (d: string) => sent.push(d), close() {}, onopen: null as null | (() => void), onmessage: null as null | ((e: { data: unknown }) => void), onclose: null };
    const heard: string[] = [];
    const chat = new bot.TwitchChat("PottedBot", "abc", (ch, user, text) => heard.push(`${ch}|${user}|${text}`), () => socket);
    chat.connect();
    chat.sync(["RyanPlays"]);
    socket.onopen!();
    expect(sent.slice(0, 3)).toEqual(["PASS oauth:abc", "NICK pottedbot", "JOIN #ryanplays"]);
    socket.onmessage!({ data: "PING :tmi.twitch.tv\r\n@badge-info=;color= :zoe!zoe@zoe.tmi.twitch.tv PRIVMSG #ryanplays :!potted\r\n" });
    expect(sent).toContain("PONG :tmi.twitch.tv");
    expect(heard).toEqual(["ryanplays|zoe|!potted"]);
    void chat.say("ryanplays", "hi\nthere");
    expect(sent.at(-1)).toBe("PRIVMSG #ryanplays :hi there");
    chat.sync([]);
    expect(sent.at(-1)).toBe("PART #ryanplays");
  });
});

describe("Kick", () => {
  beforeEach(() => Object.assign(process.env, { KICK_CLIENT_ID: "kid", KICK_CLIENT_SECRET: "ksecret" }));

  it("connects with PKCE, subscribes to the channel's chat, and replies to !potted once per message", async () => {
    const { verifier, challenge } = bot.pkce();
    expect(bot.kickAuthorizeUrl("https://potted.example/cb", "st", challenge)).toContain(`code_challenge=${challenge}&code_challenge_method=S256`);
    const { f, calls } = fakeFetch({
      "id.kick.com/oauth/token": () => Response.json({ access_token: "kat", refresh_token: "krt", expires_in: 7200 }),
      "/public/v1/channels": () => Response.json({ data: [{ broadcaster_user_id: 4242, slug: "RyanKick" }] }),
      "/public/v1/events/subscriptions": () => Response.json({ data: [] }),
      "/public/v1/chat": () => Response.json({ data: { is_sent: true } }),
    });
    await bot.connectKick(ryan(), "code1", verifier, "https://potted.example/cb", f);
    expect(String(calls[0]!.init.body)).toContain(`code_verifier=${verifier}`);
    expect(JSON.parse(String(calls[2]!.init.body))).toEqual({ broadcaster_user_id: 4242, events: [{ name: "chat.message.sent", version: 1 }], method: "webhook" });
    expect(service.settingsOf(ryan()).kickChannel).toBe("ryankick");
    expect(bot.connectedPlatforms(ryan())).toEqual(["kick"]);

    await service.createChallenge(ryan(), CHESS);
    const reply = await bot.handleKickChat("m1", { broadcaster: { user_id: 4242 }, sender: { username: "zoe", user_id: 7 }, content: "!potted" }, f);
    expect(reply).toMatch(/^@zoe 🌱 .*https:\/\/potted\.example\/j\/ryan$/);
    const chatCall = calls.find((c) => c.url.endsWith("/public/v1/chat"))!;
    expect(JSON.parse(String(chatCall.init.body))).toMatchObject({ broadcaster_user_id: 4242, type: "bot" });
    expect((chatCall.init.headers as Record<string, string>).Authorization).toBe("Bearer kat");
    expect(await bot.handleKickChat("m1", { broadcaster: { user_id: 4242 }, sender: { username: "zoe" }, content: "!potted" }, f)).toBeUndefined();
    expect(await bot.handleKickChat("m2", { broadcaster: { user_id: 9999 }, sender: { username: "zoe" }, content: "!potted" }, f)).toBeUndefined();
  });

  it("accepts only webhooks signed with Kick's key, RSA or Ed25519", async () => {
    for (const type of ["rsa", "ed25519"] as const) {
      const { publicKey, privateKey } = type === "rsa" ? generateKeyPairSync("rsa", { modulusLength: 2048 }) : generateKeyPairSync("ed25519");
      process.env.KICK_WEBHOOK_PUBLIC_KEY = publicKey.export({ type: "spki", format: "pem" }).toString();
      const body = JSON.stringify({ content: "!potted" });
      const signature = sign(type === "rsa" ? "sha256" : null, Buffer.from(`id1.2026-11-19T05:00:00Z.${body}`), privateKey).toString("base64");
      const headers = new Headers({ "kick-event-message-id": "id1", "kick-event-message-timestamp": "2026-11-19T05:00:00Z", "kick-event-signature": signature });
      expect(await bot.verifyKickWebhook(headers, body)).toBe(true);
      expect(await bot.verifyKickWebhook(headers, body.replace("potted", "pwned"))).toBe(false);
    }
    delete process.env.KICK_WEBHOOK_PUBLIC_KEY;
  });
});

describe("YouTube", () => {
  beforeEach(() => Object.assign(process.env, { GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsecret" }));

  it("connects, skips chat from before it started reading, then answers !potted in the live chat", async () => {
    let page = 0;
    const { f, calls } = fakeFetch({
      "oauth2.googleapis.com/token": () => Response.json({ access_token: "yat", refresh_token: "yrt", expires_in: 3600 }),
      "/channels?part=snippet&mine=true": () => Response.json({ items: [{ snippet: { title: "Ryan Plays", customUrl: "@RyanPlays" } }] }),
      "/liveBroadcasts": () => Response.json({ items: [{ snippet: { liveChatId: "chat1" } }] }),
      "/liveChat/messages?part=snippet": () => Response.json({ id: "sent" }),
      "/liveChat/messages?": () =>
        Response.json(
          page++ === 0
            ? { nextPageToken: "p1", pollingIntervalMillis: 2000, items: [{ snippet: { displayMessage: "!potted" }, authorDetails: { displayName: "Old" } }] }
            : { nextPageToken: "p2", pollingIntervalMillis: 2000, items: [{ snippet: { displayMessage: "nice" } }, { snippet: { displayMessage: "!potted" }, authorDetails: { displayName: "Zoe" } }] },
        ),
    });
    await bot.connectYouTube(ryan(), "gcode", "https://potted.example/cb", f);
    expect(service.settingsOf(ryan()).youtubeChannel).toBe("ryanplays");
    await service.createChallenge(ryan(), CHESS);
    expect(await bot.pollYouTube(ryan(), 0, f)).toEqual([]);
    expect(await bot.pollYouTube(ryan(), 5000, f)).toEqual([]);
    const replies = await bot.pollYouTube(ryan(), 9000, f);
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatch(/^@Zoe 🌱/);
    const insert = calls.find((c) => c.url.includes("/liveChat/messages?part=snippet") && c.init.method === "POST")!;
    expect(JSON.parse(String(insert.init.body)).snippet).toMatchObject({ liveChatId: "chat1", type: "textMessageEvent" });
    expect(calls.some((c) => c.url.includes("pageToken=p1"))).toBe(true);
  });
});

describe("announcements", () => {
  it("posts the attempt starting, the goal and the result in connected chats, rate-limited", async () => {
    const sent: string[] = [];
    bot.useSender(async (platform, _s, text) => {
      sent.push(`${platform}: ${text}`);
    });
    Object.assign(process.env, { KICK_CLIENT_ID: "kid", KICK_CLIENT_SECRET: "ks" });
    const { f } = fakeFetch({
      "id.kick.com/oauth/token": () => Response.json({ access_token: "a", refresh_token: "r", expires_in: 7200 }),
      "/public/v1/channels": () => Response.json({ data: [{ broadcaster_user_id: 1, slug: "ryan" }] }),
      "/public/v1/events/subscriptions": () => Response.json({}),
    });
    await bot.connectKick(ryan(), "c", "v", "u", f);
    expect(bot.announcementFor("pledged", "x", ryan())).toBeUndefined();
    expect(bot.announcementFor("milestone", "It reached the clouds!", ryan(), "goal")).toBe("☁️ It reached the clouds! https://potted.example/j/ryan");
    expect(await bot.announce(ryan(), "one", 1_000)).toEqual(["kick"]);
    expect(await bot.announce(ryan(), "two", 2_000)).toEqual([]);
    expect(await bot.announce(ryan(), "three", 6_000)).toEqual(["kick"]);
    await service.updateSettings(ryan(), { ...service.settingsOf(ryan()), chatBot: false });
    expect(await bot.announce(ryan(), "off", 20_000)).toEqual([]);
    expect(sent).toEqual(["kick: one", "kick: three"]);
    bot.useSender(bot.sendChat);
  });
});
