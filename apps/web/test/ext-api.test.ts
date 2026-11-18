import { beforeEach, describe, expect, it } from "vitest";
import { handleExt } from "../src/lib/ext-api";
import * as service from "../src/lib/service";
import { extToken, readExtToken } from "../src/lib/session";
import { DEMO_STREAMER_ID, resetForTests } from "../src/lib/store";

const none = new URLSearchParams();
const call = (method: string, path: string, body: Record<string, unknown> = {}, token: string | null = null, query = none) =>
  handleExt(method, path.split("/"), query, body, token);
const demo = async (as: string, name = "") => ((await call("POST", "demo", { as, name })).json as { token: string }).token;

const clipFields = { statement: "Finish the first heist without getting busted", disputeWindowSecs: "60", goalUsd: "10", pledgeCapUsd: "10", minutes: "30" };

beforeEach(() => {
  resetForTests();
  process.env.POTTED_ALLOW_SIMULATED_RESULTS = "true";
});

describe("extension tokens", () => {
  it("are signed, name one user and expire", () => {
    const token = extToken("u_abc");
    expect(readExtToken(token)).toBe("u_abc");
    expect(readExtToken(token.replace("u_abc", DEMO_STREAMER_ID))).toBeUndefined();
    expect(readExtToken(token, Date.now() + 31 * 24 * 60 * 60_000)).toBeUndefined();
    expect(readExtToken("ext.u_abc.9999999999999.forged")).toBeUndefined();
    expect(readExtToken(null)).toBeUndefined();
  });
});

describe("extension API", () => {
  it("describes every game's form so the extension can draw it", async () => {
    const config = (await call("GET", "config")).json as { games: { id: string; fields: { name: string }[] }[]; rehearsal: boolean };
    expect(config.games.find((g) => g.id === "chess")!.fields.map((f) => f.name)).toEqual(["username", "speed", "minOpponentRating"]);
    expect(config.games.find((g) => g.id === "other")!.fields.map((f) => f.name)).toEqual(["game", "statement", "proof", "disputeWindowSecs"]);
    expect(config.games.find((g) => g.id === "gta6")!.fields.map((f) => f.name)).toEqual(["statement", "proof", "disputeWindowSecs"]);
  });

  it("refuses account actions without a valid token", async () => {
    expect((await call("GET", "me")).status).toBe(401);
    expect((await call("GET", "me", {}, "ext.u_demo_streamer.9999999999999.nope")).status).toBe(401);
    expect((await call("POST", "challenges", { gameId: "gta6", fields: clipFields })).status).toBe(401);
    expect((await call("GET", "nonsense")).status).toBe(404);
  });

  it("runs a whole challenge: open, pledge, start, post clip, settle", async () => {
    const ryan = await demo("ryan");
    const maya = await demo("planter", "Maya");
    const created = (await call("POST", "challenges", { gameId: "gta6", fields: clipFields }, ryan)).json as { id: string; title: string };
    expect(created.title).toBe("GTA VI: Finish the first heist without getting busted");

    // A planter finds the stream by its handle and pledges.
    const stream = (await call("GET", "stream", {}, maya, new URLSearchParams({ handle: "ryan" }))).json as { challenges: { id: string }[] };
    expect(stream.challenges.map((c) => c.id)).toEqual([created.id]);
    const pledged = (await call("POST", `challenges/${created.id}/pledge`, { amountUsd: 5 }, maya)).json;
    expect(pledged).toMatchObject({ totalMicro: 5_000_000, mineMicro: 5_000_000, planters: 1, owner: false });

    // Only the climber can start it; the planter gets a readable error.
    const denied = await call("POST", `challenges/${created.id}/lock`, {}, maya);
    expect(denied).toMatchObject({ status: 400, json: { error: expect.stringContaining("Only this challenge's streamer") } });
    expect((await call("POST", `challenges/${created.id}/lock`, {}, ryan)).json).toMatchObject({ status: "locked", needsClip: true });
    expect((await call("POST", `challenges/${created.id}/claim`, { clipUrl: "https://clips.example.com/heist" }, ryan)).json).toMatchObject({ needsClip: false, clipPosted: true });
    expect((await call("POST", `challenges/${created.id}/simulate`, { success: true }, ryan)).json).toMatchObject({ status: "paid" });

    expect((await call("GET", "me", {}, ryan)).json).toMatchObject({ user: { role: "streamer", handle: "ryan" }, balanceMicro: 5_000_000 });
    const mine = (await call("GET", "mine", {}, ryan)).json as { live: unknown[]; recent: { id: string }[] };
    expect(mine.live).toEqual([]);
    expect(mine.recent.map((c) => c.id)).toEqual([created.id]);
    expect((await call("GET", "mine", {}, maya)).status).toBe(403);
  });

  it("rejects bad terms and over-limit pledges with the service's own messages", async () => {
    const ryan = await demo("ryan");
    const maya = await demo("planter", "Maya");
    expect(await call("POST", "challenges", { gameId: "gta6", fields: { ...clipFields, goalUsd: "0" } }, ryan)).toMatchObject({ status: 400, json: { error: expect.stringContaining("Goal") } });
    const c = (await call("POST", "challenges", { gameId: "gta6", fields: clipFields }, ryan)).json as { id: string };
    expect(await call("POST", `challenges/${c.id}/pledge`, { amountUsd: 11 }, maya)).toMatchObject({ status: 400 });
    expect((await call("POST", `challenges/${c.id}/cancel`, {}, ryan)).json).toMatchObject({ status: "failed" });
  });

  it("matches a Twitch or YouTube tab to the climber who linked that channel", async () => {
    const streamer = service.getUser(DEMO_STREAMER_ID)!;
    await service.updateSettings(streamer, { ...service.settingsOf(streamer), twitchChannel: "RyanPlays", youtubeChannel: "@ryan.live" });
    const twitch = new URLSearchParams({ platform: "twitch", channel: "ryanplays" });
    expect((await call("GET", "stream", {}, null, twitch)).json).toMatchObject({ streamer: { handle: "ryan" } });
    expect((await call("GET", "stream", {}, null, new URLSearchParams({ platform: "youtube", channel: "@Ryan.Live" }))).json).toMatchObject({ streamer: { handle: "ryan" } });
    expect((await call("GET", "stream", {}, null, new URLSearchParams({ platform: "twitch", channel: "someoneelse" }))).json).toEqual({ streamer: null, challenges: [] });
    const kai = service.getStreamer("kai")!;
    await expect(service.updateSettings(kai, { ...service.settingsOf(kai), twitchChannel: "ryanplays" })).rejects.toThrow("already linked");
  });
});

describe("extension API for planters", () => {
  it("shows the garden, takes ideas and disputes a clip the planter funded", async () => {
    const ryan = (await call("POST", "demo", { as: "ryan" })).json as { token: string };
    const fan = (await call("POST", "demo", { as: "planter", name: "Pia" })).json as { token: string };
    const c = (await call("POST", "challenges", { gameId: "gta6", fields: { statement: "Finish the heist", disputeWindowSecs: "600", goalUsd: "10", pledgeCapUsd: "10", minutes: "30", upfrontPct: "0" } }, ryan.token)).json as { id: string };
    await call("POST", `challenges/${c.id}/pledge`, { amountUsd: 4 }, fan.token);

    const garden = (await call("GET", "garden", {}, fan.token)).json as { backed: number; badges: { earned: boolean }[]; activity: unknown[] };
    expect(garden.backed).toBe(1);
    expect(garden.badges.some((b) => b.earned)).toBe(true);
    expect(garden.activity).toHaveLength(1);
    expect((await call("GET", "garden", {}, ryan.token)).status).toBe(403);

    expect((await call("POST", "ideas", { handle: "ryan", gameId: "gta6", text: "Win a race without hitting a wall" }, fan.token)).status).toBe(200);

    await call("POST", `challenges/${c.id}/lock`, {}, ryan.token);
    let view = (await call("POST", `challenges/${c.id}/claim`, { clipUrl: "https://clips.example.com/x" }, ryan.token)).json as { canDispute: boolean };
    const stream = (await call("GET", "stream", {}, fan.token, new URLSearchParams("handle=ryan"))).json as { challenges: { canDispute: boolean; clipUrl: string }[] };
    expect(stream.challenges[0]).toMatchObject({ canDispute: true, clipUrl: "https://clips.example.com/x" });
    view = (await call("POST", `challenges/${c.id}/dispute`, {}, fan.token)).json as { canDispute: boolean; disputedByMe: boolean };
    expect(view).toMatchObject({ canDispute: false, disputedByMe: true });
  });
});

describe("extension browse, search and top planters", () => {
  it("lists live streams, finds a climber by their Twitch channel, and ranks a stream's planters", async () => {
    const ryan = await demo("ryan");
    const pia = await demo("planter", "Pia");
    const bo = await demo("planter", "Bo");
    const c = (await call("POST", "challenges", { gameId: "gta6", fields: { ...clipFields, upfrontPct: "0" } }, ryan)).json as { id: string };
    await call("POST", `challenges/${c.id}/pledge`, { amountUsd: 3 }, pia);
    await call("POST", `challenges/${c.id}/pledge`, { amountUsd: 7 }, bo);

    const live = (await call("GET", "live", {}, pia)).json as { forYou: { handle: string; reason: string }[]; trending: { handle: string }[]; streams: { handle: string; potMicro: number }[] };
    expect(live.streams[0]).toMatchObject({ handle: "ryan", potMicro: 10_000_000 });
    expect(live.trending.map((t) => t.handle)).toContain("ryan");
    expect(live.forYou[0]).toMatchObject({ handle: "ryan" });
    expect(((await call("GET", "live")).json as { forYou: unknown[] }).forYou).toEqual([]);

    const streamer = service.getUser(DEMO_STREAMER_ID)!;
    await service.updateSettings(streamer, { ...service.settingsOf(streamer), twitchChannel: "RyanPlaysLive" });
    const byChannel = (await call("GET", "search", {}, null, new URLSearchParams({ q: "ryanplays" }))).json as { streamers: { handle: string; live: boolean }[] };
    expect(byChannel.streamers[0]).toMatchObject({ handle: "ryan", live: true });
    expect(((await call("GET", "search", {}, null, new URLSearchParams({ q: "r" }))).json as { streamers: unknown[] }).streamers).toEqual([]);

    const stream = (await call("GET", "stream", {}, pia, new URLSearchParams({ handle: "ryan" }))).json as { topPlanters: { name: string; you: boolean }[] };
    expect(stream.topPlanters.map((t) => t.name)).toEqual(["Bo", "Pia"]);
    expect(stream.topPlanters[1]!.you).toBe(true);
  });
});
