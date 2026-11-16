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
    expect(types).toEqual(["created", "pledged", "pledged", "locked", "paid"]);
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
