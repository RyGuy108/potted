import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { toMicro } from "@potted/core";
import type { Deps } from "@potted/verifier";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as service from "../src/lib/service";
import { DEMO_STREAMER_ID, resetForTests } from "../src/lib/store";

process.env.POTTED_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "potted-test-"));

const streamer = () => service.getUser(DEMO_STREAMER_ID)!;
const chess = { kind: "lichess", username: "ryan", speed: "bullet" };
const base = { gameId: "chess", condition: chess, goalUsd: 20, pledgeCapUsd: 10, minutes: 30 };

/** A Lichess reply holding one finished game, started just after "now". */
function lichess(winner: "white" | "black", source = "pool"): Deps {
  const game = {
    id: "game0001",
    rated: true,
    variant: "standard",
    speed: "bullet",
    source,
    status: "mate",
    createdAt: Date.now() + 1_000,
    lastMoveAt: Date.now() + 60_000,
    winner,
    moves: Array(40).fill("e4").join(" "),
    players: { white: { user: { name: "ryan" }, rating: 1800 }, black: { user: { name: "opp" }, rating: 1800 } },
  };
  const fetch = (async () => new Response(JSON.stringify(game) + "\n")) as unknown as typeof globalThis.fetch;
  return { fetch, env: {} };
}

beforeEach(() => {
  resetForTests();
  vi.useRealTimers();
  delete process.env.POTTED_ALLOW_SIMULATED_RESULTS;
});

describe("challenge lifecycle on the sim ledger", () => {
  it("pays the streamer when the game data shows a win", async () => {
    const ana = await service.signIn("Ana", "fan");
    const ben = await service.signIn("Ben", "fan");
    const c = await service.createChallenge(streamer(), base);
    await service.pledge(ana, c.id, 5);
    await service.pledge(ben, c.id, 2.5);
    await service.lock(streamer(), c.id);

    const settled = await service.check(c.id, { force: true, deps: lichess("white") });
    expect(settled.status).toBe("paid");
    expect(settled.verdict?.evidence?.url).toBe("https://lichess.org/game0001");
    expect(await service.balanceOf(streamer())).toBe(toMicro(7.5));
    expect(await service.balanceOf(ana)).toBe(toMicro(20));
    const types = service.eventsSince("ryan", 0).map((e) => e.type);
    expect(types).toEqual(["created", "pledged", "comment", "pledged", "milestone", "locked", "paid"]);
  });

  it("refunds every fan in full when the streamer loses", async () => {
    const ana = await service.signIn("Ana", "fan");
    const c = await service.createChallenge(streamer(), base);
    await service.pledge(ana, c.id, 4);
    await service.pledge(ana, c.id, 3);
    await service.lock(streamer(), c.id);

    const settled = await service.check(c.id, { force: true, deps: lichess("black") });
    expect(settled.status).toBe("failed");
    expect(await service.balanceOf(ana)).toBe(toMicro(25));
    expect(await service.balanceOf(streamer())).toBe(0);
    expect(service.pledgesFor(c.id).every((p) => p.refunded && p.refundTx)).toBe(true);
  });

  it("does not settle on a win arranged through a direct challenge", async () => {
    const ana = await service.signIn("Ana", "fan");
    const c = await service.createChallenge(streamer(), base);
    await service.pledge(ana, c.id, 4);
    await service.lock(streamer(), c.id);
    const after = await service.check(c.id, { force: true, deps: lichess("white", "friend") });
    expect(after.status).toBe("locked");
    expect(after.verdict?.outcome).toBe("pending");
  });

  it("enforces roles, the per-fan cap and the pledge window", async () => {
    const ana = await service.signIn("Ana", "fan");
    await expect(service.createChallenge(ana, base)).rejects.toThrow("Only the streamer");
    const c = await service.createChallenge(streamer(), base);
    await expect(service.pledge(streamer(), c.id, 1)).rejects.toThrow("Sign in as a fan");
    await service.pledge(ana, c.id, 8);
    await expect(service.pledge(ana, c.id, 3)).rejects.toThrow("per-fan limit");
    await expect(service.lock(ana, c.id)).rejects.toThrow("Only this challenge's streamer");
    await service.lock(streamer(), c.id);
    await expect(service.pledge(ana, c.id, 1)).rejects.toThrow("no longer taking pledges");
  });

  it("refunds everyone if no result arrives by the settlement cutoff", async () => {
    const ana = await service.signIn("Ana", "fan");
    const c = await service.createChallenge(streamer(), base);
    await service.pledge(ana, c.id, 6);
    await service.lock(streamer(), c.id);
    vi.useFakeTimers();
    vi.setSystemTime(c.settleBy + 1);
    const after = await service.check(c.id);
    expect(after.status).toBe("failed");
    expect(await service.balanceOf(ana)).toBe(toMicro(25));
  });
});

describe("optimistic challenges (GTA VI)", () => {
  const gta = {
    gameId: "gta6",
    condition: { kind: "optimistic", game: "GTA VI", statement: "Finish the first heist without getting busted", disputeWindowSecs: 60 },
    goalUsd: 20,
    pledgeCapUsd: 10,
    minutes: 30,
  };

  async function claimed() {
    const ana = await service.signIn("Ana", "fan");
    const c = await service.createChallenge(streamer(), gta);
    await service.pledge(ana, c.id, 5);
    await service.lock(streamer(), c.id);
    await service.claim(streamer(), c.id, "https://clips.example/first-heist");
    return { ana, c };
  }

  it("settles once the dispute window passes with no dispute", async () => {
    const { c } = await claimed();
    expect((await service.check(c.id, { force: true })).status).toBe("locked");
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 61_000);
    const settled = await service.check(c.id, { force: true });
    expect(settled.status).toBe("paid");
    expect(settled.verdict?.evidence?.source).toBe("clip");
  });

  it("holds the pot when a funder disputes, then follows the moderator", async () => {
    const { ana, c } = await claimed();
    const outsider = await service.signIn("Zed", "fan");
    await expect(service.dispute(outsider, c.id)).rejects.toThrow("Only funders");
    await service.dispute(ana, c.id);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 5 * 60_000);
    expect((await service.check(c.id, { force: true })).status).toBe("locked");
    vi.useRealTimers();

    await expect(service.rule(streamer(), c.id, true)).rejects.toThrow("Only a moderator");
    const mod = await service.signIn("Mo", "mod");
    const ruled = await service.rule(mod, c.id, false);
    expect(ruled.status).toBe("failed");
    expect(await service.balanceOf(ana)).toBe(toMicro(25));
  });

  it("rejects clips that are not https links", async () => {
    const c = await service.createChallenge(streamer(), gta);
    await service.lock(streamer(), c.id);
    await expect(service.claim(streamer(), c.id, "javascript:alert(1)")).rejects.toThrow("https://");
  });
});

describe("rehearsal results", () => {
  it("are off by default and marked as simulated when on", async () => {
    const c = await service.createChallenge(streamer(), base);
    await service.lock(streamer(), c.id);
    await expect(service.simulateResult(streamer(), c.id, true)).rejects.toThrow("turned off");
    process.env.POTTED_ALLOW_SIMULATED_RESULTS = "true";
    const done = await service.simulateResult(streamer(), c.id, true);
    expect(done.verdict?.evidence?.simulated).toBe(true);
  });
});

describe("streamer controls", () => {
  it("cancels a challenge and refunds every fan, before or during the attempt", async () => {
    const ana = await service.signIn("Ana", "fan");
    const c = await service.createChallenge(streamer(), base);
    await service.pledge(ana, c.id, 6);
    await expect(service.cancel(ana, c.id)).rejects.toThrow("Only this challenge's streamer");
    await service.lock(streamer(), c.id);

    const cancelled = await service.cancel(streamer(), c.id);
    expect(cancelled.status).toBe("failed");
    expect(cancelled.verdict?.reason).toBe("Cancelled by the streamer");
    expect(await service.balanceOf(ana)).toBe(toMicro(25));
    expect(await service.balanceOf(streamer())).toBe(0);
    await expect(service.cancel(streamer(), c.id)).rejects.toThrow("already settled");
  });

  it("enforces the streamer's minimum pledge", async () => {
    const ana = await service.signIn("Ana", "fan");
    await service.updateSettings(streamer(), { ...service.settingsOf(streamer()), minPledgeUsd: 2 });
    const c = await service.createChallenge(streamer(), base);
    await expect(service.pledge(ana, c.id, 1)).rejects.toThrow("smallest pledge on this stream is $2");
    await service.pledge(ana, c.id, 2);
  });

  it("takes fan suggestions, with blocked words, a per-fan limit and an off switch", async () => {
    const ana = await service.signIn("Ana", "fan");
    await service.updateSettings(streamer(), { ...service.settingsOf(streamer()), blockedWords: "Spoiler, x" });
    expect(service.settingsOf(streamer()).blockedWords).toEqual(["spoiler"]);
    await expect(service.suggest(ana, "ryan", "gta6", "Play the SPOILER mission tonight")).rejects.toThrow("blocked");
    await expect(service.suggest(ana, "ryan", "gta6", "short")).rejects.toThrow("8 to 140");

    for (const n of [1, 2, 3]) await service.suggest(ana, "ryan", "chess", `Win game number ${n} with black`);
    await expect(service.suggest(ana, "ryan", "chess", "One more idea for you")).rejects.toThrow("already have 3");
    const [first] = service.pendingSuggestions(streamer().id);
    await expect(service.resolveSuggestion(ana, first!.id, "dismissed")).rejects.toThrow("Only the streamer");
    await service.resolveSuggestion(streamer(), first!.id, "dismissed");
    expect(service.pendingSuggestions(streamer().id)).toHaveLength(2);

    await service.updateSettings(streamer(), { ...service.settingsOf(streamer()), acceptingSuggestions: false });
    await expect(service.suggest(ana, "ryan", "chess", "Is anyone reading these?")).rejects.toThrow("not taking suggestions");
  });

  it("rejects bad settings and lets only streamers change them", async () => {
    const ana = await service.signIn("Ana", "fan");
    const current = service.settingsOf(streamer());
    await expect(service.updateSettings(ana, current)).rejects.toThrow("Only a streamer");
    await expect(service.updateSettings(streamer(), { ...current, minPledgeUsd: 0 })).rejects.toThrow("Minimum pledge");
    await expect(service.updateSettings(streamer(), { ...current, overlayPosition: "middle" })).rejects.toThrow("overlay position");
  });

  it("reopens a settled challenge with the same terms", async () => {
    const c = await service.createChallenge(streamer(), base);
    await expect(service.runAgain(streamer(), c.id)).rejects.toThrow("Finish this challenge");
    await service.cancel(streamer(), c.id);
    const again = await service.runAgain(streamer(), c.id);
    expect(again.id).not.toBe(c.id);
    expect(again).toMatchObject({ status: "open", title: c.title, goalMicro: c.goalMicro, pledgeCapMicro: c.pledgeCapMicro });
    expect(Math.round((again.deadline - again.createdAt) / 60_000)).toBe(30);
  });
});

describe("announcer", () => {
  const messages = (type: string) => service.eventsSince("ryan", 0).filter((e) => e.type === type).map((e) => e.message);

  it("announces each growth stage once, and only the highest when a pledge jumps stages", async () => {
    const ana = await service.signIn("Ana", "fan");
    const ben = await service.signIn("Ben", "fan");
    const c = await service.createChallenge(streamer(), { ...base, goalUsd: 12, pledgeCapUsd: 10 });
    await service.pledge(ana, c.id, 1);
    expect(messages("milestone")).toEqual([]);
    await service.pledge(ana, c.id, 3);
    expect(messages("milestone")).toEqual(["The vine is climbing. A third of the way to the clouds."]);
    await service.pledge(ana, c.id, 1);
    expect(messages("milestone")).toHaveLength(1);
    await service.pledge(ben, c.id, 7);
    expect(messages("milestone")[1]).toBe("The beanstalk has reached the clouds! $12 is in the pot.");
    expect(messages("milestone")).toHaveLength(2);
  });

  it("recaps the stream with earnings, refunds and the biggest backer", async () => {
    expect(service.recapText(streamer())).toBe("No challenges yet this stream.");
    const ana = await service.signIn("Ana", "fan");
    const ben = await service.signIn("Ben", "fan");
    const won = await service.createChallenge(streamer(), base);
    await service.pledge(ana, won.id, 6);
    await service.pledge(ben, won.id, 2);
    await service.lock(streamer(), won.id);
    process.env.POTTED_ALLOW_SIMULATED_RESULTS = "true";
    await service.simulateResult(streamer(), won.id, true);
    delete process.env.POTTED_ALLOW_SIMULATED_RESULTS;
    const lost = await service.createChallenge(streamer(), base);
    await service.pledge(ben, lost.id, 3);
    await service.cancel(streamer(), lost.id);

    await expect(service.announceRecap(ana)).rejects.toThrow("Only a streamer");
    const text = await service.announceRecap(streamer());
    expect(text).toBe("2 challenges so far, 1 completed. Ryan earned $8. Fans got $3 back. Biggest backer: Ana, with $6.");
    expect(messages("recap")).toEqual([text]);
  });

  it("validates the announcer voice", async () => {
    const current = service.settingsOf(streamer());
    expect(current.voice).toBe("george");
    await expect(service.updateSettings(streamer(), { ...current, voice: "hal" })).rejects.toThrow("Unknown announcer voice");
    expect((await service.updateSettings(streamer(), { ...current, voice: "sarah" })).voice).toBe("sarah");
  });
});

describe("fan garden", () => {
  it("lists what a fan backed and where the money went", async () => {
    const ana = await service.signIn("Ana", "fan");
    expect(service.gardenOf(ana).plots).toEqual([]);
    const won = await service.createChallenge(streamer(), base);
    await service.pledge(ana, won.id, 4);
    await service.pledge(ana, won.id, 2);
    await service.lock(streamer(), won.id);
    await service.check(won.id, { force: true, deps: lichess("white") });
    const lost = await service.createChallenge(streamer(), base);
    await service.pledge(ana, lost.id, 3);
    await service.cancel(streamer(), lost.id);

    const garden = service.gardenOf(ana);
    expect(garden).toMatchObject({ grown: 1, pledgedMicro: toMicro(9), paidMicro: toMicro(6), returnedMicro: toMicro(3) });
    expect(garden.plots.map((p) => [p.amountMicro, p.refunded]).sort()).toEqual([[toMicro(3), true], [toMicro(6), false]].sort());
  });
});

describe("collabs", () => {
  const kai = () => service.getStreamer("kai")!;

  it("opens nothing until the guest accepts, then splits a completed pot", async () => {
    const ana = await service.signIn("Ana", "fan");
    const sent = await service.invite(streamer(), "kai", 40, base);
    expect(service.stageChallenges(kai().id)).toEqual([]);
    expect(service.invitesFor(kai()).incoming).toHaveLength(1);
    await expect(service.respondInvite(streamer(), sent.id, true)).rejects.toThrow("Only the invited streamer");

    const c = (await service.respondInvite(kai(), sent.id, true))!;
    expect(c.splits).toEqual([{ kind: "guest", userId: kai().id, name: "Kai", pct: 40 }]);
    expect(service.stageChallenges(kai().id).map((x) => x.id)).toEqual([c.id]);
    await expect(service.respondInvite(kai(), sent.id, true)).rejects.toThrow("already answered");

    await service.pledge(ana, c.id, 5);
    await service.lock(streamer(), c.id);
    await expect(service.lock(kai(), c.id)).rejects.toThrow("Only this challenge's streamer");
    await service.check(c.id, { force: true, deps: lichess("white") });
    expect(await service.balanceOf(streamer())).toBe(toMicro(3));
    expect(await service.balanceOf(kai())).toBe(toMicro(2));
    // Both overlays hear about it.
    expect(service.eventsSince("kai", 0).map((e) => e.type)).toEqual(["created", "pledged", "locked", "paid"]);
    expect(service.eventsSince("kai", 0).at(-1)!.message).toBe("Challenge complete! Ryan and Kai earned $5.");
    expect(service.recapText(kai())).toContain("Kai earned $2.");
    await expect(service.runAgain(streamer(), c.id)).rejects.toThrow("Send a new invite");
  });

  it("refunds fans in full when a collab fails", async () => {
    const ana = await service.signIn("Ana", "fan");
    const c = (await service.respondInvite(kai(), (await service.invite(streamer(), "kai", 50, base)).id, true))!;
    await service.pledge(ana, c.id, 5);
    await service.cancel(streamer(), c.id);
    expect(await service.balanceOf(ana)).toBe(toMicro(25));
    expect(await service.balanceOf(kai())).toBe(0);
  });

  it("validates invites and lets either side back out before it opens", async () => {
    await expect(service.invite(streamer(), "ryan", 50, base)).rejects.toThrow("another streamer");
    await expect(service.invite(streamer(), "nobody", 50, base)).rejects.toThrow("No streamer");
    await expect(service.invite(streamer(), "kai", 95, base)).rejects.toThrow("90%");
    await expect(service.invite(streamer(), "kai", 50, { ...base, goalUsd: 0 })).rejects.toThrow("Goal");
    const declined = await service.invite(streamer(), "kai", 50, base);
    expect(await service.respondInvite(kai(), declined.id, false)).toBeUndefined();
    const withdrawn = await service.invite(streamer(), "kai", 50, base);
    await expect(service.withdrawInvite(kai(), withdrawn.id)).rejects.toThrow("Only the host");
    await service.withdrawInvite(streamer(), withdrawn.id);
    expect(service.invitesFor(kai()).incoming).toEqual([]);
    expect(service.stageChallenges(kai().id)).toEqual([]);
  });
});

describe("charity streams", () => {
  const on = async (pct = 50) =>
    service.updateSettings(streamer(), { ...service.settingsOf(streamer()), causeOn: true, causeName: "Austin Pets Alive", causeUrl: "https://example.org/apa", causePct: pct });

  it("sends the cause its share of a completed pot and counts what was raised", async () => {
    const ana = await service.signIn("Ana", "fan");
    const before = await service.createChallenge(streamer(), base);
    await on(50);
    const c = await service.createChallenge(streamer(), base);
    expect(before.splits).toBeUndefined();
    expect(c.splits).toEqual([{ kind: "cause", name: "Austin Pets Alive", pct: 50, url: "https://example.org/apa" }]);

    await service.pledge(ana, c.id, 7);
    expect(service.raisedFor(streamer(), "Austin Pets Alive")).toEqual({ raisedMicro: 0, inPlayMicro: toMicro(3.5), confirmedMicro: 0 });
    await service.lock(streamer(), c.id);
    await service.check(c.id, { force: true, deps: lichess("white") });
    expect(await service.balanceOf(streamer())).toBe(toMicro(3.5));
    expect(service.raisedFor(streamer(), "Austin Pets Alive")).toEqual({ raisedMicro: toMicro(3.5), inPlayMicro: 0, confirmedMicro: 0 });
    expect(service.eventsSince("ryan", 0).at(-1)!.message).toBe("Challenge complete! Ryan earned $3.50. $3.50 goes to Austin Pets Alive.");
    expect(service.recapText(streamer())).toContain("$3.50 raised for Austin Pets Alive.");
  });

  it("refunds fans in full on a miss and pays the cause nothing", async () => {
    const ana = await service.signIn("Ana", "fan");
    await on(80);
    const c = await service.createChallenge(streamer(), base);
    await service.pledge(ana, c.id, 5);
    await service.cancel(streamer(), c.id);
    expect(await service.balanceOf(ana)).toBe(toMicro(25));
    expect(service.raisedFor(streamer(), "Austin Pets Alive")).toEqual({ raisedMicro: 0, inPlayMicro: 0, confirmedMicro: 0 });
  });

  it("splits three ways on a charity collab and refuses shares that leave the host under 10%", async () => {
    const kai = service.getStreamer("kai")!;
    const ana = await service.signIn("Ana", "fan");
    await on(50);
    await expect(service.invite(streamer(), "kai", 45, base)).rejects.toThrow("90%");
    const c = (await service.respondInvite(kai, (await service.invite(streamer(), "kai", 30, base)).id, true))!;
    await service.pledge(ana, c.id, 10);
    await service.lock(streamer(), c.id);
    await service.check(c.id, { force: true, deps: lichess("white") });
    expect([await service.balanceOf(streamer()), await service.balanceOf(kai)]).toEqual([toMicro(2), toMicro(3)]);
    expect(service.raisedFor(streamer(), "Austin Pets Alive").raisedMicro).toBe(toMicro(5));
  });

  it("validates the cause", async () => {
    const s = service.settingsOf(streamer());
    await expect(service.updateSettings(streamer(), { ...s, causeOn: true, causeName: "" })).rejects.toThrow("Name the cause");
    await expect(service.updateSettings(streamer(), { ...s, causeOn: true, causeName: "Fund", causePct: 95 })).rejects.toThrow("90%");
    await expect(service.updateSettings(streamer(), { ...s, causeName: "Fund", causeUrl: "javascript:alert(1)" })).rejects.toThrow("https://");
  });
});

describe("games not on the platform", () => {
  it("lets a fan name any game on a suggestion, subject to the blocked words", async () => {
    const ana = await service.signIn("Ana", "fan");
    await service.updateSettings(streamer(), { ...service.settingsOf(streamer()), blockedWords: "gacha" });
    const idea = await service.suggest(ana, "ryan", "other", "Clear the first boss without healing", "  Hollow   Knight ");
    expect(idea.customGame).toBe("Hollow Knight");
    await expect(service.suggest(ana, "ryan", "other", "Pull the limited banner unit", "Some Gacha Game")).rejects.toThrow("blocked");
    expect((await service.suggest(ana, "ryan", "chess", "Win a game with the Bongcloud", "ignored")).customGame).toBeUndefined();
  });

  it("opens a Steam achievement challenge and keeps a proof rule on clip challenges", async () => {
    const steam = await service.createChallenge(streamer(), {
      ...base,
      gameId: "steam",
      condition: { kind: "steam", steamId: "76561198000000000", appId: "367520", gameName: "Hollow Knight", achievement: "STEEL_SOUL", achievementTitle: "Steel Soul" },
    });
    expect(steam.title).toBe('Hollow Knight: unlock "Steel Soul" on Steam');
    await expect(
      service.createChallenge(streamer(), { ...base, gameId: "steam", condition: { kind: "steam", steamId: "123", appId: 1, gameName: "X", achievement: "A" } }),
    ).rejects.toThrow("17-digit");
    const clip = await service.createChallenge(streamer(), {
      ...base,
      gameId: "speedrun",
      condition: { kind: "optimistic", game: "Speedruns", statement: "Beat my personal best", proof: "The final split with the timer visible", disputeWindowSecs: 60 },
    });
    expect(clip.condition).toMatchObject({ proof: "The final split with the timer visible" });
  });
});

describe("streamer dashboard", () => {
  const clip = { gameId: "gta6", condition: { kind: "optimistic", game: "GTA VI", statement: "Finish the heist", disputeWindowSecs: 60 }, goalUsd: 10, pledgeCapUsd: 10, minutes: 30 };

  it("runs a campaign that new challenges join, and reports its progress", async () => {
    const fan = await service.signIn("Maya", "fan");
    const campaign = await service.startCampaign(streamer(), "Launch week", 50);
    await expect(service.startCampaign(streamer(), "Another", 0)).rejects.toThrow("End the current campaign");
    const c = await service.createChallenge(streamer(), clip);
    expect(c.campaignId).toBe(campaign.id);
    await service.pledge(fan, c.id, 6);
    expect(service.campaignStats(campaign)).toMatchObject({ challenges: 1, live: 1, raisedMicro: toMicro(6), planters: 1 });
    await service.endCampaign(streamer(), campaign.id);
    expect((await service.createChallenge(streamer(), { ...clip, condition: { ...clip.condition, statement: "Win a street race" } })).campaignId).toBeUndefined();
  });

  it("lists payouts with their receipts", async () => {
    process.env.POTTED_ALLOW_SIMULATED_RESULTS = "true";
    const fan = await service.signIn("Ben", "fan");
    const c = await service.createChallenge(streamer(), clip);
    await service.pledge(fan, c.id, 8);
    await service.lock(streamer(), c.id);
    await service.claim(streamer(), c.id, "https://clips.example.com/x");
    await service.simulateResult(streamer(), c.id, true);
    const { rows, totalMicro } = service.payoutsFor(streamer());
    expect(totalMicro).toBe(toMicro(8));
    expect(rows[0]).toMatchObject({ kind: "completed", amountMicro: toMicro(8), href: `/c/${c.id}` });
    expect(rows[0]!.tx).toBeTruthy();
  });

  it("only takes ideas for the challenge types the climber accepts", async () => {
    const fan = await service.signIn("Cy", "fan");
    await service.updateSettings(streamer(), { ...service.settingsOf(streamer()), acceptedGames: ["chess", "nope"] });
    expect(service.settingsOf(streamer()).acceptedGames).toEqual(["chess"]);
    await expect(service.suggest(fan, "ryan", "fortnite", "Get ten eliminations")).rejects.toThrow("not taking Fortnite");
    await expect(service.suggest(fan, "ryan", "chess", "Win a blitz game against 1800")).resolves.toBeTruthy();
  });

  it("puts on-chain activity into the recap facts", async () => {
    const c = await service.createChallenge(streamer(), clip);
    const account = service.chainAccountOf(c.ledgerRef!);
    const { db } = await import("../src/lib/store");
    db().chain.push({ key: "k1", signature: "s", slot: 1, at: Date.now(), name: "Pledged", challenge: account, fields: { challenge: account, amount: 1, totalPledged: 1 } } as never);
    expect(service.recapFacts(streamer()).onChain.pledges).toBe(1);
  });
});
