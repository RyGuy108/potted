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
    Object.assign(process.env, { TWITCH_BOT_USERNAME: "pottedbot", TWITCH_BOT_TOKEN: "t" });
    await service.updateSettings(ryan(), { ...service.settingsOf(ryan()), twitchChannel: "ryanplays" });
    expect(bot.announcementFor("pledged", "x", ryan())).toBeUndefined();
    expect(bot.announcementFor("milestone", "It reached the clouds!", ryan(), "goal")).toBe("☁️ It reached the clouds! https://potted.example/j/ryan");
    expect(await bot.announce(ryan(), "one", 1_000)).toEqual(["twitch"]);
    expect(await bot.announce(ryan(), "two", 2_000)).toEqual([]);
    expect(await bot.announce(ryan(), "three", 6_000)).toEqual(["twitch"]);
    await service.updateSettings(ryan(), { ...service.settingsOf(ryan()), chatBot: false });
    expect(await bot.announce(ryan(), "off", 20_000)).toEqual([]);
    expect(sent).toEqual(["twitch: one", "twitch: three"]);
    bot.useSender(bot.sendChat);
    delete process.env.TWITCH_BOT_USERNAME;
    delete process.env.TWITCH_BOT_TOKEN;
  });
});
