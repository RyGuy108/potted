import { beforeEach, describe, expect, it } from "vitest";
import { allPointsOf, pointsConfig, pointsOf, redeem, redemptionsFor, resolveRedemption, updatePoints } from "../src/lib/points";
import { addSampleHistory, removeSample } from "../src/lib/sample-data";
import * as service from "../src/lib/service";
import { DEMO_STREAMER_ID, db, resetForTests } from "../src/lib/store";
import { resetTwitchCache, twitchChannel } from "../src/lib/twitch";

const clip = { kind: "optimistic", game: "GTA VI", statement: "Finish the heist", disputeWindowSecs: 60 };

beforeEach(() => {
  resetForTests();
  process.env.POTTED_ALLOW_SIMULATED_RESULTS = "true";
});

async function setup() {
  const ryan = service.getUser(DEMO_STREAMER_ID)!;
  const fan = await service.signIn("Maya", "fan");
  const c = await service.createChallenge(ryan, { gameId: "gta6", condition: clip, goalUsd: 20, pledgeCapUsd: 20, minutes: 30 });
  return { ryan, fan, c };
}

describe("channel points", () => {
  it("earns from pledges at the climber's rate and loses what a refund gives back", async () => {
    const { ryan, fan, c } = await setup();
    await service.pledge(fan, c.id, 5);
    expect(pointsOf(fan, ryan.id)).toEqual({ earned: 500, spent: 0, balance: 500 });
    await service.cancel(ryan, c.id);
    expect(pointsOf(fan, ryan.id).earned).toBe(0);
  });

  it("can count only completed challenges", async () => {
    const { ryan, fan, c } = await setup();
    await updatePoints(ryan, { on: true, perUsd: 40, when: "completed", rewards: [] });
    await service.pledge(fan, c.id, 5);
    expect(pointsOf(fan, ryan.id).earned).toBe(0);
    await service.lock(ryan, c.id);
    await service.simulateResult(ryan, c.id, true);
    expect(pointsOf(fan, ryan.id).earned).toBe(200);
  });

  it("redeems into the climber's queue, announces it, and refunds points when asked", async () => {
    const { ryan, fan, c } = await setup();
    await service.pledge(fan, c.id, 10);
    const reward = pointsConfig(ryan.id).rewards.find((r) => r.needsInput)!;
    await expect(redeem(fan, "ryan", reward.id, "")).rejects.toThrow("needs a line");
    const r = await redeem(fan, "ryan", reward.id, "Win a race without crashing");
    expect(pointsOf(fan, ryan.id).spent).toBe(reward.cost);
    expect(db().events.at(-1)).toMatchObject({ type: "redeemed", handle: "ryan" });
    expect(redemptionsFor(ryan.id)[0]).toMatchObject({ id: r.id, status: "pending", fanName: "Maya", input: "Win a race without crashing" });
    await expect(resolveRedemption(fan, r.id, "fulfilled")).rejects.toThrow("Only this redemption's climber");
    await resolveRedemption(ryan, r.id, "refunded");
    expect(pointsOf(fan, ryan.id).spent).toBe(0);
    await expect(resolveRedemption(ryan, r.id, "fulfilled")).rejects.toThrow("already answered");
  });

  it("refuses rewards a planter can't afford, disabled rewards and non-planters", async () => {
    const { ryan, fan, c } = await setup();
    await service.pledge(fan, c.id, 1);
    const pricey = pointsConfig(ryan.id).rewards.at(-1)!;
    await expect(redeem(fan, "ryan", pricey.id)).rejects.toThrow("more points");
    await updatePoints(ryan, { on: true, perUsd: 1000, when: "pledged", rewards: [{ title: "Hidden", cost: 1, enabled: false }] });
    await expect(redeem(fan, "ryan", pointsConfig(ryan.id).rewards[0]!.id)).rejects.toThrow("not available");
    await expect(redeem(ryan, "ryan", "x")).rejects.toThrow("planter");
    await updatePoints(ryan, { on: false, perUsd: 100, when: "pledged", rewards: [] });
    await expect(redeem(fan, "ryan", "x")).rejects.toThrow("turned channel points off");
  });

  it("checks the climber's setup", async () => {
    const { ryan } = await setup();
    await expect(updatePoints(ryan, { on: true, perUsd: 0, when: "pledged", rewards: [] })).rejects.toThrow("Points per dollar");
    await expect(updatePoints(ryan, { on: true, perUsd: 10, when: "pledged", rewards: [{ title: "x", cost: 5 }] })).rejects.toThrow("Reward 1");
    await expect(updatePoints(ryan, { on: true, perUsd: 10, when: "pledged", rewards: [{ title: "Okay", cost: -1 }] })).rejects.toThrow("cost");
    const saved = await updatePoints(ryan, { on: true, perUsd: 10, when: "weird", rewards: [{ id: "keep-me", title: "Okay", cost: 5, needsInput: true }] });
    expect(saved).toMatchObject({ when: "pledged", rewards: [{ id: "keep-me", needsInput: true, enabled: true }] });
  });

  it("sample planters never owe points, and the sample's points come out with it", () => {
    addSampleHistory(db());
    const maya = service.getUser("u_s_maya")!;
    expect(allPointsOf(maya).length).toBeGreaterThan(0);
    for (const fan of db().users.filter((u) => u.role === "fan")) {
      for (const p of allPointsOf(fan)) expect(p.earned - pointsOf(fan, p.streamer.id).spent).toBeGreaterThanOrEqual(0);
    }
    expect(redemptionsFor(DEMO_STREAMER_ID).some((r) => r.status === "pending")).toBe(true);
    removeSample(db());
    expect(db().redemptions).toEqual([]);
    expect(Object.keys(db().points ?? {})).toEqual([]);
  });
});

describe("twitch", () => {
  beforeEach(() => resetTwitchCache());
  const env = { TWITCH_CLIENT_ID: "id", TWITCH_CLIENT_SECRET: "secret" };

  it("reads the picture and live status with an app token, and caches it", async () => {
    const calls: string[] = [];
    const fetch = (async (url: string) => {
      calls.push(url);
      if (url.startsWith("https://id.twitch.tv")) return Response.json({ access_token: "tok", expires_in: 3600 });
      if (url.includes("/users")) return Response.json({ data: [{ login: "ryanplays", display_name: "RyanPlays", profile_image_url: "https://img/p.png", offline_image_url: "" }] });
      return Response.json({ data: [{ type: "live", title: "Heists", game_name: "GTA VI", viewer_count: 42, started_at: new Date().toISOString(), thumbnail_url: "https://img/live_{width}x{height}.jpg" }] });
    }) as typeof globalThis.fetch;
    const deps = { fetch, env, now: () => 1_000_000 };
    const ch = await twitchChannel("RyanPlays", deps);
    expect(ch).toMatchObject({ displayName: "RyanPlays", profileImageUrl: "https://img/p.png", url: "https://www.twitch.tv/ryanplays", live: { viewers: 42, gameName: "GTA VI" } });
    expect(ch!.live!.thumbnailUrl).toContain("live_640x360.jpg");
    await twitchChannel("ryanplays", deps);
    expect(calls.filter((u) => u.includes("/users"))).toHaveLength(1);
  });

  it("gives nothing without keys or when Twitch fails", async () => {
    expect(await twitchChannel("ryanplays", { fetch: globalThis.fetch, env: {}, now: Date.now })).toBeNull();
    const failing = (async () => new Response("no", { status: 500 })) as typeof globalThis.fetch;
    expect(await twitchChannel("ryanplays", { fetch: failing, env, now: Date.now })).toBeNull();
    expect(await twitchChannel("bad name!", { fetch: failing, env, now: Date.now })).toBeNull();
  });
});

describe("twitch category links", () => {
  it("points each game at its Twitch category, or Twitch's front page", async () => {
    const { twitchCategoryUrl } = await import("../src/lib/twitch");
    expect(twitchCategoryUrl("gta6", "GTA VI")).toBe("https://www.twitch.tv/directory/category/grand-theft-auto-vi");
    expect(twitchCategoryUrl("cooking", "Cooking")).toBe("https://www.twitch.tv/directory/category/food-drink");
    expect(twitchCategoryUrl("speedrun", "Celeste")).toBe("https://www.twitch.tv/directory/category/celeste");
    expect(twitchCategoryUrl("other", "Hollow Knight: Silksong")).toBe("https://www.twitch.tv/directory/category/hollow-knight-silksong");
    expect(twitchCategoryUrl(undefined)).toBe("https://www.twitch.tv/");
  });
});
