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

    const google = provider({ sub: "g-2", name: "Creator", email: "creator@gmail.com", email_verified: true });
    expect(await fetchProfile("google", "c", "http://cb", google)).toMatchObject({ emailVerified: true });
    const external = provider({ sub: "g-3", name: "Creator", email: "creator@example.com", email_verified: true });
    expect(await fetchProfile("google", "c", "http://cb", external)).not.toHaveProperty("emailVerified");

    const twitch = provider({ data: [{ id: "t-9", display_name: "KaiPlays", email: "kai@example.com" }] });
    expect(await fetchProfile("twitch", "c", "http://cb", twitch)).toMatchObject({ subject: "t-9", name: "KaiPlays", emailVerified: true });
    expect((twitch.calls[1]!.init.headers as Record<string, string>)["Client-Id"]).toBe("tid");
  });

  it("fails cleanly on a rejected code or an unreadable profile", async () => {
    await expect(fetchProfile("google", "bad", "http://cb", provider({}, 400))).rejects.toThrow("rejected");
    await expect(fetchProfile("google", "c", "http://cb", provider({ name: "No id" }))).rejects.toThrow("unreadable");
  });

  it("creates one account per provider identity and asks it to choose a role", async () => {
    const maya = await service.signInWith("google", { subject: "g-1", name: "Maya", email: "maya@example.com", emailVerified: true });
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

  it("lets a new account become a keeper only with the invite code", async () => {
    const ada = await service.signInWith("google", { subject: "g-keeper", name: "Ada" });
    delete process.env.POTTED_KEEPER_CODE;
    await expect(service.chooseRole(ada, "mod", "", "anything")).rejects.toThrow("invite only");
    process.env.POTTED_KEEPER_CODE = "garden-keys";
    try {
      await expect(service.chooseRole(ada, "mod", "", "wrong")).rejects.toThrow("not right");
      expect(ada.onboarded).toBe(false);
      await service.chooseRole(ada, "mod", "", " garden-keys ");
      expect(ada).toMatchObject({ role: "mod", onboarded: true });
    } finally {
      delete process.env.POTTED_KEEPER_CODE;
    }
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

describe("analytics by account type", () => {
  const streamer = () => service.getUser(DEMO_STREAMER_ID)!;
  const clip = (gameId: string, game: string) => ({
    gameId,
    condition: { kind: "optimistic", game, statement: "Do the thing on stream", disputeWindowSecs: 60 },
    goalUsd: 10,
    pledgeCapUsd: 10,
    minutes: 30,
  });

  it("gives a climber earnings, completion rate, returning planters and a per-game split", async () => {
    const ana = await service.signIn("Ana", "fan");
    const ben = await service.signIn("Ben", "fan");
    process.env.POTTED_ALLOW_SIMULATED_RESULTS = "true";
    const won = await service.createChallenge(streamer(), clip("gta6", "GTA VI"));
    await service.pledge(ana, won.id, 6);
    await service.pledge(ben, won.id, 2);
    await service.lock(streamer(), won.id);
    await service.simulateResult(streamer(), won.id, true);
    const lost = await service.createChallenge(streamer(), clip("cooking", "Cooking"));
    await service.pledge(ana, lost.id, 4);
    await service.lock(streamer(), lost.id);
    await service.simulateResult(streamer(), lost.id, false);
    delete process.env.POTTED_ALLOW_SIMULATED_RESULTS;
    await service.createChallenge(streamer(), clip("gta6", "GTA VI"));

    expect(service.climberStats(streamer())).toMatchObject({
      total: 3, live: 1, completed: 1, missed: 1, completionPct: 50,
      earnedMicro: 8_000_000, refundedMicro: 4_000_000, planters: 2, returning: 1, averagePotMicro: 6_000_000,
      byGame: [{ gameId: "gta6", challenges: 2, completed: 1, earnedMicro: 8_000_000 }, { gameId: "cooking", challenges: 1, completed: 0, earnedMicro: 0 }],
    });
    expect(service.climberStats(streamer()).history.map((h) => [h.potMicro, h.paid])).toEqual([[8_000_000, true], [4_000_000, false]]);
    expect(service.planterActivity(ana).map((r) => r.kind).sort()).toEqual(["paid", "pledged", "pledged", "refunded"]);
  });

  it("records which keeper ruled and what the ruling decided", async () => {
    const ana = await service.signIn("Ana", "fan");
    const sam = await service.signIn("Sam", "mod");
    const other = await service.signIn("Other", "mod");
    const c = await service.createChallenge(streamer(), { ...clip("gta6", "GTA VI"), condition: { kind: "optimistic", game: "GTA VI", statement: "Do the thing on stream", disputeWindowSecs: 600 } });
    await service.pledge(ana, c.id, 5);
    await service.lock(streamer(), c.id);
    await service.claim(streamer(), c.id, "https://clips.example.com/a");
    await service.dispute(ana, c.id);
    expect(service.keeperStats(sam).waiting.map((x) => x.id)).toEqual([c.id]);
    await service.rule(sam, c.id, false);
    expect(service.keeperStats(sam)).toMatchObject({ waiting: [], upheld: 0, rejected: 1, refundedMicro: 5_000_000 });
    expect(service.keeperStats(other).ruled).toEqual([]);
  });
});

describe("bounties", () => {
  beforeEach(() => {
    process.env.POTTED_ALLOW_SIMULATED_RESULTS = "true";
  });
  const streamer = () => service.getUser(DEMO_STREAMER_ID)!;
  const terms = (pledgeCapUsd = 10) => ({
    gameId: "gta6",
    condition: { kind: "optimistic", game: "GTA VI", statement: "Finish the first heist without getting busted", disputeWindowSecs: 60 },
    goalUsd: 20,
    pledgeCapUsd,
    minutes: 30,
  });
  const post = (fan: Parameters<typeof service.postBounty>[0], amountUsd = 5, hours = 24) =>
    service.postBounty(fan, { handle: "ryan", gameId: "gta6", text: "Finish the first heist without getting busted", amountUsd, hours });

  it("holds the money, lets others add to it, and pays it when the attempt starts, whatever the result", async () => {
    const maya = await service.signIn("Maya", "fan");
    const ben = await service.signIn("Ben", "fan");
    const bounty = await post(maya, 5);
    await service.backBounty(ben, bounty.id, 3);
    await service.backBounty(maya, bounty.id, 1);
    expect(await service.balanceOf(maya)).toBe(19_000_000);
    expect(service.bountyTotal(bounty.id)).toBe(9_000_000);
    expect(service.backersOf(bounty.id).map((b) => [b.name, b.amountMicro])).toEqual([["Maya", 6_000_000], ["Ben", 3_000_000]]);
    expect(service.eventsSince("ryan", 0).filter((e) => e.type === "bounty")).toHaveLength(3);

    await expect(service.acceptBounty(service.getStreamer("kai")!, bounty.id, terms())).rejects.toThrow("Only the streamer this bounty is for");
    const c = await service.acceptBounty(streamer(), bounty.id, terms());
    // Request money is not in the completion pot; it waits for the attempt to start.
    expect(c).toMatchObject({ status: "open", totalMicro: 0, requestMicro: 9_000_000 });
    expect(service.getBounty(bounty.id)).toMatchObject({ status: "accepted", challengeId: c.id });
    await service.pledge(ben, c.id, 2);
    await service.lock(streamer(), c.id);
    expect(await service.balanceOf(streamer())).toBe(9_000_000);
    expect(service.getChallenge(c.id).requestPaidMicro).toBe(9_000_000);
    // A miss refunds the completion pledge only; the request money stays paid.
    await service.simulateResult(streamer(), c.id, false);
    expect(await service.balanceOf(streamer())).toBe(9_000_000);
    expect(await service.balanceOf(ben)).toBe(22_000_000);
    expect(service.earnedBy(service.getChallenge(c.id), streamer().id)).toBe(9_000_000);
    expect(service.payoutsFor(streamer()).rows[0]).toMatchObject({ kind: "request", amountMicro: 9_000_000 });
    await expect(service.backBounty(ben, bounty.id, 1)).rejects.toThrow("closed");
  });

  it("returns request money if the climber takes it on but never starts", async () => {
    const maya = await service.signIn("Maya", "fan");
    const bounty = await post(maya, 5);
    const c = await service.acceptBounty(streamer(), bounty.id, terms());
    await service.cancel(streamer(), c.id);
    expect(await service.balanceOf(maya)).toBe(25_000_000);
    expect(await service.balanceOf(streamer())).toBe(0);
  });

  it("returns every backer's money on decline or expiry", async () => {
    const maya = await service.signIn("Maya", "fan");
    const ben = await service.signIn("Ben", "fan");
    const declined = await post(maya, 5);
    await service.backBounty(ben, declined.id, 2);
    await service.declineBounty(streamer(), declined.id);
    expect([await service.balanceOf(maya), await service.balanceOf(ben)]).toEqual([25_000_000, 25_000_000]);
    await expect(service.declineBounty(streamer(), declined.id)).rejects.toThrow("closed");

    const expiring = await post(maya, 4, 1);
    expect(await service.expireBounties(Date.now() + 2 * 60 * 60_000)).toBe(1);
    expect(service.getBounty(expiring.id).status).toBe("expired");
    expect(await service.balanceOf(maya)).toBe(25_000_000);
    expect(service.bountiesBackedBy(maya).map((r) => r.bounty.status)).toEqual(["expired", "declined"]);
  });

  it("checks who can post, how much, for how long, and the streamer's switch", async () => {
    const maya = await service.signIn("Maya", "fan");
    await expect(post(streamer() as never)).rejects.toThrow("Sign in as a planter");
    await expect(post(maya, 0.1)).rejects.toThrow("smallest amount");
    await expect(post(maya, 501)).rejects.toThrow("up to $500");
    await expect(post(maya, 5, 100)).rejects.toThrow("1 to 72 hours");
    expect(await service.balanceOf(maya)).toBe(25_000_000);
    for (let i = 0; i < 3; i++) await post(maya, 1);
    await expect(post(maya, 1)).rejects.toThrow("3 open bounties");
    await service.updateSettings(streamer(), { ...service.settingsOf(streamer()), acceptingBounties: false });
    const ben = await service.signIn("Ben", "fan");
    await expect(post(ben, 1)).rejects.toThrow("not taking bounties");
  });
});

describe("up-front share", () => {
  beforeEach(() => {
    process.env.POTTED_ALLOW_SIMULATED_RESULTS = "true";
  });
  const streamer = () => service.getUser(DEMO_STREAMER_ID)!;
  const terms = (upfrontPct: number) => ({
    gameId: "gta6",
    condition: { kind: "optimistic", game: "GTA VI", statement: "Finish the first heist without getting busted", disputeWindowSecs: 60 },
    goalUsd: 20,
    pledgeCapUsd: 10,
    minutes: 30,
    upfrontPct,
  });

  it("pays the share when the attempt starts and the rest on completion", async () => {
    const maya = await service.signIn("Maya", "fan");
    const ben = await service.signIn("Ben", "fan");
    const c = await service.createChallenge(streamer(), terms(50));
    await service.pledge(maya, c.id, 6);
    await service.pledge(ben, c.id, 4);
    await service.lock(streamer(), c.id);
    expect(c.upfrontPaidMicro).toBe(5_000_000);
    expect(await service.balanceOf(streamer())).toBe(5_000_000);
    expect(service.eventsSince("ryan", 0).find((e) => e.type === "locked")!.message).toBe(
      "Pledging is closed. Ryan got $5 for taking it on; the other $5 pays out only if they finish.",
    );
    await service.simulateResult(streamer(), c.id, true);
    expect(await service.balanceOf(streamer())).toBe(10_000_000);
    expect(service.earnedBy(c, streamer().id)).toBe(10_000_000);
  });

  it("refunds only the part not paid up front on a miss, one refund per fan", async () => {
    const maya = await service.signIn("Maya", "fan");
    const c = await service.createChallenge(streamer(), terms(25));
    await service.pledge(maya, c.id, 3);
    await service.pledge(maya, c.id, 1);
    await service.lock(streamer(), c.id);
    await service.simulateResult(streamer(), c.id, false);
    // Maya pledged $4; $1 went up front, $3 came back.
    expect(await service.balanceOf(maya)).toBe(24_000_000);
    expect(await service.balanceOf(streamer())).toBe(1_000_000);
    expect(service.gardenOf(maya).returnedMicro).toBe(3_000_000);
    expect(service.climberStats(streamer())).toMatchObject({ earnedMicro: 1_000_000, refundedMicro: 3_000_000, completed: 0, missed: 1 });
    expect(service.planterActivity(maya)[0]!.text).toBe("Missed: the part not paid up front came back");
  });

  it("refunds in full when cancelled before the start, and keeps the share after it", async () => {
    const maya = await service.signIn("Maya", "fan");
    const early = await service.createChallenge(streamer(), terms(50));
    await service.pledge(maya, early.id, 4);
    await service.cancel(streamer(), early.id);
    expect(await service.balanceOf(maya)).toBe(25_000_000);
    const late = await service.createChallenge(streamer(), terms(50));
    await service.pledge(maya, late.id, 4);
    await service.lock(streamer(), late.id);
    await service.cancel(streamer(), late.id);
    expect(await service.balanceOf(maya)).toBe(23_000_000);
    expect(await service.balanceOf(streamer())).toBe(2_000_000);
  });

  it("splits the up-front share with a collab guest and a cause", async () => {
    const kai = service.getStreamer("kai")!;
    const maya = await service.signIn("Maya", "fan");
    await service.updateSettings(streamer(), { ...service.settingsOf(streamer()), causeOn: true, causeName: "Austin Pets Alive", causePct: 20 });
    const c = (await service.respondInvite(kai, (await service.invite(streamer(), "kai", 30, terms(50))).id, true))!;
    await service.pledge(maya, c.id, 10);
    await service.lock(streamer(), c.id);
    // $5 up front: Kai 30% = $1.50, cause 20% = $1, Ryan the rest = $2.50.
    expect([await service.balanceOf(streamer()), await service.balanceOf(kai)]).toEqual([2_500_000, 1_500_000]);
    await service.simulateResult(streamer(), c.id, true);
    expect([await service.balanceOf(streamer()), await service.balanceOf(kai)]).toEqual([5_000_000, 3_000_000]);
    expect(service.raisedFor(streamer(), "Austin Pets Alive").raisedMicro).toBe(2_000_000);
  });

  it("refuses more than half up front", async () => {
    await expect(service.createChallenge(streamer(), terms(60))).rejects.toThrow("0 to 50");
    await expect(service.createChallenge(streamer(), terms(12.5))).rejects.toThrow("whole percent");
  });
});

describe("up-front share carries over", () => {
  it("keeps the setting on a rerun", async () => {
    process.env.POTTED_ALLOW_SIMULATED_RESULTS = "true";
    const s = service.getUser(DEMO_STREAMER_ID)!;
    const c = await service.createChallenge(s, {
      gameId: "gta6",
      condition: { kind: "optimistic", game: "GTA VI", statement: "Finish the first heist without getting busted", disputeWindowSecs: 60 },
      goalUsd: 20,
      pledgeCapUsd: 10,
      minutes: 30,
      upfrontPct: 25,
    });
    await service.cancel(s, c.id);
    expect((await service.runAgain(s, c.id)).upfrontPct).toBe(25);
  });
});

describe("email-based account matching", () => {
  it("links verified Google and Twitch sign-ins to one email account and preserves the planter role", async () => {
    const email = "planter@gmail.com";
    const original = await service.signInWith("email", { subject: email, name: "Planter", email });
    await service.chooseRole(original, "fan");
    const google = await service.signInWith("google", { subject: "google-1", name: "Google", email: email.toUpperCase(), emailVerified: true });
    const twitch = await service.signInWith("twitch", { subject: "twitch-1", name: "Twitch", email, emailVerified: true });
    expect(google.id).toBe(original.id);
    expect(twitch).toMatchObject({ id: original.id, wallet: original.wallet, role: "fan", onboarded: true });
    expect(twitch.identities).toHaveLength(3);
    expect(twitch.settings).toBeUndefined();
  });

  it("reuses an OAuth-first account with email and rejects unverified or conflicting providers", async () => {
    const email = "creator@gmail.com";
    const original = await service.signInWith("google", { subject: "google-a", name: "Creator", email, emailVerified: true });
    await expect(service.signInWith("twitch", { subject: "unverified", name: "Other", email })).rejects.toThrow("original sign-in");
    await expect(service.signInWith("google", { subject: "google-b", name: "Other", email, emailVerified: true })).rejects.toThrow("original sign-in");
    const verified = await service.signInWith("email", { subject: email, name: "Email", email });
    expect(verified.id).toBe(original.id);
  });

  it("does not create a duplicate on simultaneous verified sign-ins", async () => {
    const email = "race@gmail.com";
    const [google, twitch] = await Promise.all([
      service.signInWith("google", { subject: "g-race", name: "Google", email, emailVerified: true }),
      service.signInWith("twitch", { subject: "t-race", name: "Twitch", email, emailVerified: true }),
    ]);
    expect(google.id).toBe(twitch.id);
    expect(google.identities).toHaveLength(2);
  });
});
