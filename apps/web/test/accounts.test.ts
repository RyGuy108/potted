import { beforeEach, describe, expect, it } from "vitest";
import { type Deps, authorizeUrl, fetchProfile, isConfigured } from "../src/lib/oauth";
import * as service from "../src/lib/service";
import { readSessionToken, sessionToken } from "../src/lib/session";
import { DEMO_STREAMER_ID, resetForTests } from "../src/lib/store";

const env = { GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsecret", TWITCH_CLIENT_ID: "tid", TWITCH_CLIENT_SECRET: "tsecret" };

function provider(profile: unknown, tokenStatus = 200): Deps & { calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  return {
    calls,
    env,
    fetch: (async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      if (init.method === "POST") return new Response(JSON.stringify({ access_token: "tok" }), { status: tokenStatus });
      return new Response(JSON.stringify(profile));
    }) as typeof fetch,
  };
}

beforeEach(() => resetForTests());

describe("provider sign-in", () => {
  it("builds the provider's sign-in address only when it is configured", () => {
    expect(isConfigured("google", env)).toBe(true);
    expect(isConfigured("discord", env)).toBe(false);
    const url = new URL(authorizeUrl("google", "http://localhost:3000/api/auth/google/callback", "abc", env));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ client_id: "gid", state: "abc", response_type: "code", scope: "openid email profile" });
    expect(() => authorizeUrl("discord", "http://x", "s", env)).toThrow("not set up");
  });

  it("exchanges the code once and reads the profile", async () => {
    const deps = provider({ sub: "g-1", given_name: "Maya", email: "maya@example.com" });
    expect(await fetchProfile("google", "code-1", "http://cb", deps)).toEqual({ subject: "g-1", name: "Maya", email: "maya@example.com" });
    expect(String(deps.calls[0]!.init.body)).toContain("code=code-1");
    expect((deps.calls[1]!.init.headers as Record<string, string>).Authorization).toBe("Bearer tok");

    const twitch = provider({ data: [{ id: "t-9", display_name: "KaiPlays" }] });
    expect(await fetchProfile("twitch", "c", "http://cb", twitch)).toMatchObject({ subject: "t-9", name: "KaiPlays" });
    expect((twitch.calls[1]!.init.headers as Record<string, string>)["Client-Id"]).toBe("tid");
  });

  it("fails cleanly on a rejected code or an unreadable profile", async () => {
    await expect(fetchProfile("google", "bad", "http://cb", provider({}, 400))).rejects.toThrow("rejected");
    await expect(fetchProfile("google", "c", "http://cb", provider({ name: "No id" }))).rejects.toThrow("unreadable");
  });

  it("creates one account per provider identity and asks it to choose a role", async () => {
    const maya = await service.signInWith("google", { subject: "g-1", name: "Maya", email: "maya@example.com" });
    expect(maya).toMatchObject({ role: "fan", onboarded: false });
    expect(await service.balanceOf(maya)).toBeGreaterThan(0);
    expect((await service.signInWith("google", { subject: "g-1", name: "Renamed" })).id).toBe(maya.id);
    expect((await service.signInWith("twitch", { subject: "g-1", name: "Other" })).id).not.toBe(maya.id);
  });

  it("lets a new account become a planter or a climber with its own stream address, once", async () => {
    const maya = await service.signInWith("google", { subject: "g-1", name: "Maya" });
    await service.chooseRole(maya, "fan");
    expect(maya.onboarded).toBe(true);
    await expect(service.chooseRole(maya, "streamer", "maya")).rejects.toThrow("already chosen");

    const kira = await service.signInWith("twitch", { subject: "t-1", name: "Kira" });
    await expect(service.chooseRole(kira, "streamer", "x")).rejects.toThrow("3 to 20");
    await expect(service.chooseRole(kira, "streamer", "Ryan")).rejects.toThrow("taken");
    await service.chooseRole(kira, "streamer", "Kira_Live");
    expect(service.getStreamer("kira_live")?.id).toBe(kira.id);
    const noah = await service.signInWith("twitch", { subject: "t-2", name: "Noah" });
    await expect(service.chooseRole(noah, "streamer", "kira_live")).rejects.toThrow("taken");
  });
});

describe("sessions", () => {
  it("accepts only cookies it signed", () => {
    const token = sessionToken("u_abc");
    expect(readSessionToken(token)).toBe("u_abc");
    expect(readSessionToken(token.replace("u_abc", DEMO_STREAMER_ID))).toBeUndefined();
    expect(readSessionToken(DEMO_STREAMER_ID)).toBeUndefined();
    expect(readSessionToken(`${DEMO_STREAMER_ID}.`)).toBeUndefined();
    expect(readSessionToken(undefined)).toBeUndefined();
  });
});

describe("planter stats", () => {
  const streamer = () => service.getUser(DEMO_STREAMER_ID)!;
  const terms = (gameId: string, game: string) => ({
    gameId,
    condition: { kind: "optimistic", game, statement: "Do the thing on stream", disputeWindowSecs: 60 },
    goalUsd: 10,
    pledgeCapUsd: 10,
    minutes: 30,
  });

  it("awards points for taking part, not for the size of a pledge", async () => {
    const big = await service.signIn("Big", "fan");
    const small = await service.signIn("Small", "fan");
    const c = await service.createChallenge(streamer(), terms("gta6", "GTA VI"));
    await service.pledge(small, c.id, 1);
    await service.pledge(big, c.id, 9);
    // Small was first in; Big made the pledge that reached the goal.
    expect(service.planterStats(small)).toMatchObject({ xp: 15, backed: 1, firstIn: 1, cloudPushes: 0 });
    expect(service.planterStats(big)).toMatchObject({ xp: 20, backed: 1, firstIn: 0, cloudPushes: 1 });
    expect(service.planterStats(big).badges.find((b) => b.id === "cloud-pusher")?.earned).toBe(true);
    expect(service.topPlanters(streamer().id).map((p) => p.name)).toEqual(["Big", "Small"]);
  });

  it("tracks levels, completed challenges, variety and the daily streak", async () => {
    const ana = await service.signIn("Ana", "fan");
    process.env.POTTED_ALLOW_SIMULATED_RESULTS = "true";
    for (const [id, game] of [["gta6", "GTA VI"], ["cooking", "Cooking"], ["music", "Music"]] as const) {
      const c = await service.createChallenge(streamer(), terms(id, game));
      await service.pledge(ana, c.id, 2);
      await service.lock(streamer(), c.id);
      await service.simulateResult(streamer(), c.id, true);
    }
    delete process.env.POTTED_ALLOW_SIMULATED_RESULTS;
    const stats = service.planterStats(ana);
    // 3 backed (30) + 3 completed (45) + 3 first in (15)
    expect(stats).toMatchObject({ xp: 90, backed: 3, grown: 3, streakDays: 1, level: { name: "Vine tender", next: { name: "Green thumb", at: 200 } } });
    expect(stats.badges.filter((b) => b.earned).map((b) => b.id)).toEqual(["first-bean", "early-bird", "good-harvest", "wide-garden", "hat-trick"]);
    // Two days later with no pledge, the streak is over.
    expect(service.planterStats(ana, Date.now() + 2 * 24 * 60 * 60_000).streakDays).toBe(0);
    // Refunded money does not count toward the leaderboard.
    const miss = await service.createChallenge(streamer(), terms("gta6", "GTA VI"));
    await service.pledge(ana, miss.id, 5);
    await service.cancel(streamer(), miss.id);
    expect(service.topPlanters(streamer().id)[0]).toMatchObject({ name: "Ana", challenges: 3 });
  });
});

describe("browsing and search", () => {
  const streamer = () => service.getUser(DEMO_STREAMER_ID)!;
  const clip = (gameId: string, game: string, statement: string) => ({
    gameId,
    condition: { kind: "optimistic", game, statement, disputeWindowSecs: 60 },
    goalUsd: 10,
    pledgeCapUsd: 10,
    minutes: 30,
  });

  it("lists who is live per game, biggest pots first, and drops them when they settle", async () => {
    const kai = service.getStreamer("kai")!;
    const ana = await service.signIn("Ana", "fan");
    const a = await service.createChallenge(streamer(), clip("gta6", "GTA VI", "Finish the first heist clean"));
    await service.createChallenge(streamer(), clip("gta6", "GTA VI", "Win a street race"));
    const b = await service.createChallenge(kai, clip("gta6", "GTA VI", "Escape five stars"));
    await service.createChallenge(kai, clip("cooking", "Cooking", "Bake bread on stream"));
    await service.pledge(ana, a.id, 3);
    await service.pledge(ana, b.id, 7);

    const gta = service.liveStreams("gta6");
    expect(gta.map((l) => [l.streamer.name, l.liveCount, l.potMicro / 1e6, l.planters, l.headline.title])).toEqual([
      ["Kai", 1, 7, 1, "GTA VI: Escape five stars"],
      ["Ryan", 2, 3, 1, "GTA VI: Finish the first heist clean"],
    ]);
    expect(service.liveStreams("chess")).toEqual([]);
    expect(service.liveCountsByGame()).toEqual({ gta6: 2, cooking: 1 });

    await service.cancel(kai, b.id);
    expect(service.liveStreams("gta6").map((l) => l.streamer.name)).toEqual(["Ryan"]);
    expect(service.recentResults("gta6").map((c) => c.id)).toEqual([b.id]);
  });

  it("finds climbers who have run challenges, games, and challenges by title", async () => {
    const kira = await service.signInWith("twitch", { subject: "t-1", name: "Kira" });
    await service.chooseRole(kira, "streamer", "kira_live");
    await service.createChallenge(streamer(), clip("cooking", "Cooking", "Bake sourdough on stream"));

    expect(service.search("rya").streamers.map((r) => r.streamer.handle)).toEqual(["ryan"]);
    // Kira has an account but has never set up a challenge.
    expect(service.search("kira").streamers).toEqual([]);
    expect(service.search("@RYAN").streamers).toHaveLength(1);
    expect(service.search("sourdough").challenges.map((c) => c.title)).toEqual(["Cooking: Bake sourdough on stream"]);
    const byGame = service.search("cook");
    expect(byGame.games.map((g) => g.id)).toEqual(["cooking"]);
    expect(byGame.challenges).toHaveLength(1);
    expect(service.search("x")).toEqual({ games: [], streamers: [], challenges: [] });
  });

  it("summarises a finished challenge for the climber's tile", async () => {
    const ana = await service.signIn("Ana", "fan");
    const ben = await service.signIn("Ben", "fan");
    const c = await service.createChallenge(streamer(), clip("gta6", "GTA VI", "Finish the first heist clean"));
    await service.pledge(ana, c.id, 6);
    await service.pledge(ben, c.id, 2);
    await service.lock(streamer(), c.id);
    process.env.POTTED_ALLOW_SIMULATED_RESULTS = "true";
    await service.simulateResult(streamer(), c.id, true);
    delete process.env.POTTED_ALLOW_SIMULATED_RESULTS;
    expect(service.challengeStats(c, streamer().id)).toMatchObject({ planters: 2, pctOfGoal: 80, biggestMicro: 6_000_000, shareMicro: 8_000_000 });
  });

  it("has sixteen badges, including ones for refunds and used suggestions", async () => {
    const ana = await service.signIn("Ana", "fan");
    const idea = await service.suggest(ana, "ryan", "gta6", "Finish the first heist clean");
    const c = await service.createChallenge(streamer(), clip("gta6", "GTA VI", "Finish the first heist clean"));
    await service.resolveSuggestion(streamer(), idea.id, "used");
    await service.pledge(ana, c.id, 2);
    await service.cancel(streamer(), c.id);
    const badges = service.planterStats(ana).badges;
    expect(badges).toHaveLength(16);
    expect(badges.filter((b) => b.earned).map((b) => b.id)).toEqual(["first-bean", "early-bird", "money-back", "idea-planter"]);
  });
});
