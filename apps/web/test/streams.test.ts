import { beforeEach, describe, expect, it } from "vitest";
import * as service from "../src/lib/service";
import { DEMO_STREAMER_ID, resetForTests } from "../src/lib/store";
import { gameFor, lookupStream, parseStreamLink } from "../src/lib/streams";

beforeEach(() => resetForTests());

describe("stream links", () => {
  it("reads Twitch, Kick and YouTube links in their common shapes", () => {
    expect(parseStreamLink("https://www.twitch.tv/RyanPlays?ref=x")).toEqual({ platform: "twitch", channel: "ryanplays", url: "https://www.twitch.tv/ryanplays" });
    expect(parseStreamLink("twitch.tv/ryanplays/videos")).toMatchObject({ channel: "ryanplays" });
    expect(parseStreamLink("kick.com/Kai_Live")).toEqual({ platform: "kick", channel: "kai_live", url: "https://kick.com/kai_live" });
    expect(parseStreamLink("https://youtube.com/@Juniper.Mines/live")).toEqual({ platform: "youtube", channel: "juniper.mines", url: "https://www.youtube.com/@juniper.mines/live" });
    expect(parseStreamLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toEqual({ platform: "youtube", channel: "", videoId: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    expect(parseStreamLink("https://youtu.be/dQw4w9WgXcQ")).toMatchObject({ videoId: "dQw4w9WgXcQ" });
    expect(parseStreamLink("https://www.youtube.com/live/dQw4w9WgXcQ")).toMatchObject({ videoId: "dQw4w9WgXcQ" });
  });

  it("explains links it cannot use", () => {
    expect(() => parseStreamLink("https://www.twitch.tv/directory")).toThrow("no channel");
    expect(() => parseStreamLink("https://vimeo.com/123")).toThrow("Twitch, YouTube and Kick");
    expect(() => parseStreamLink("https://youtube.com/")).toThrow("channel link");
  });

  it("maps a platform's category or title to a Potted game", () => {
    expect(gameFor("Fortnite")).toEqual({ gameId: "fortnite" });
    expect(gameFor("Grand Theft Auto VI")).toEqual({ gameId: "gta6" });
    expect(gameFor("Just Chatting")).toEqual({ gameId: "other" });
    expect(gameFor(undefined, "Hardcore Minecraft day 40!")).toEqual({ gameId: "minecraft" });
    expect(gameFor("Elden Ring")).toEqual({ gameId: "other", customGame: "Elden Ring" });
  });

  it("reads a Kick stream's title and category, and a YouTube video's title, without failing on errors", async () => {
    const kick = (async () => Response.json({ user: { username: "Kai" }, livestream: { is_live: true, session_title: "Ranked grind", categories: [{ name: "Fortnite" }] } })) as unknown as typeof fetch;
    expect(await lookupStream(parseStreamLink("kick.com/kai"), { fetch: kick })).toEqual({ channelName: "Kai", live: true, title: "Ranked grind", category: "Fortnite" });
    const yt = (async () => Response.json({ title: "Speedrun attempts", author_name: "Juniper" })) as unknown as typeof fetch;
    expect(await lookupStream(parseStreamLink("youtu.be/dQw4w9WgXcQ"), { fetch: yt })).toEqual({ title: "Speedrun attempts", channelName: "Juniper" });
    const down = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    expect(await lookupStream(parseStreamLink("kick.com/kai"), { fetch: down })).toEqual({});
  });
});

describe("going live", () => {
  it("links the channel, keeps the stream's game, shows on browse and ends", async () => {
    const ryan = service.getUser(DEMO_STREAMER_ID)!;
    const session = await service.goLive(ryan, "kick.com/RyanLive", async () => ({ title: "Heist night", category: "Grand Theft Auto VI", live: true }));
    expect(session).toMatchObject({ platform: "kick", channel: "ryanlive", gameId: "gta6", title: "Heist night" });
    expect(service.settingsOf(ryan).kickChannel).toBe("ryanlive");
    expect(service.streamerByChannel("kick", "RyanLive")?.id).toBe(ryan.id);
    expect(service.liveSessionOf(ryan)).toBeDefined();
    expect(service.liveSessionOf(ryan, Date.now() + 13 * 60 * 60_000)).toBeUndefined();

    const kai = service.getStreamer("kai")!;
    await expect(service.goLive(kai, "kick.com/ryanlive", async () => ({}))).rejects.toThrow("already linked");
    const fan = await service.signIn("Ana", "fan");
    await expect(service.goLive(fan, "kick.com/ana", async () => ({}))).rejects.toThrow("Only a climber");

    service.endStream(ryan);
    expect(service.liveSessionOf(ryan)).toBeUndefined();
  });
});
