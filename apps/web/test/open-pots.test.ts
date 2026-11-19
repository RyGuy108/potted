import { OPEN_POT_CAP_MICRO, growthOf, isOpenPot } from "@potted/core";
import { beforeEach, describe, expect, it } from "vitest";
import { give, giftTotals } from "../src/lib/gifts";
import { noticesFor } from "../src/lib/notifications";
import { pointsOf } from "../src/lib/points";
import * as service from "../src/lib/service";
import { DEMO_STREAMER_ID, db, resetForTests } from "../src/lib/store";

const clip = { kind: "optimistic", game: "GTA VI", statement: "Finish the heist", disputeWindowSecs: 60 };

beforeEach(() => {
  resetForTests();
  process.env.POTTED_ALLOW_SIMULATED_RESULTS = "true";
});

describe("open pots", () => {
  it("have no goal and no per-fan limit, and still pay only on completion", async () => {
    const ryan = service.getUser(DEMO_STREAMER_ID)!;
    const fan = await service.signIn("Maya", "fan");
    const c = await service.createChallenge(ryan, { gameId: "gta6", condition: clip, goalUsd: 0, pledgeCapUsd: 0, minutes: 30, open: true });
    expect(isOpenPot(c)).toBe(true);
    expect(c.pledgeCapMicro).toBe(OPEN_POT_CAP_MICRO);
    // Past any ordinary limit, in several pledges.
    await service.pledge(fan, c.id, 15);
    await service.pledge(fan, c.id, 10);
    expect(service.getChallenge(c.id).totalMicro).toBe(25_000_000);
    expect(growthOf(25_000_000, 0).index).toBe(2);
    expect(noticesFor(fan).some((n) => n.title.includes("reached its goal"))).toBe(false);
    expect(db().events.some((e) => e.message.includes("open pot passed"))).toBe(true);
    expect(service.challengeStats(c, ryan.id).pctOfGoal).toBeNull();
    await service.lock(ryan, c.id);
    await service.simulateResult(ryan, c.id, false);
    expect(service.pledgesFor(c.id).every((p) => p.refunded)).toBe(true);
    // Running it again keeps it open.
    const again = await service.runAgain(ryan, c.id);
    expect(isOpenPot(again)).toBe(true);
  });

  it("still checks the goal for ordinary pots, and caps one pledge in an open pot", async () => {
    const ryan = service.getUser(DEMO_STREAMER_ID)!;
    await expect(service.createChallenge(ryan, { gameId: "gta6", condition: clip, goalUsd: 0, pledgeCapUsd: 5, minutes: 30 })).rejects.toThrow("Goal");
    const fan = await service.signIn("Maya", "fan");
    const c = await service.createChallenge(ryan, { gameId: "gta6", condition: clip, goalUsd: 0, pledgeCapUsd: 0, minutes: 30, open: true });
    await expect(service.pledge(fan, c.id, 600)).rejects.toThrow("up to $500");
  });
});

describe("just give", () => {
  it("moves money straight to the climber, earns points, and tells everyone", async () => {
    const ryan = service.getUser(DEMO_STREAMER_ID)!;
    const fan = await service.signIn("Maya", "fan");
    const before = await service.balanceOf(ryan);
    await give(fan, "ryan", 5, "great stream");
    expect(await service.balanceOf(fan)).toBe(20_000_000);
    expect(await service.balanceOf(ryan)).toBe(before + 5_000_000);
    expect(giftTotals(ryan.id)).toEqual({ totalMicro: 5_000_000, count: 1, givers: 1 });
    expect(pointsOf(fan, ryan.id).earned).toBe(500);
    expect(db().events.at(-1)).toMatchObject({ type: "gift", message: 'Maya gave $5: "great stream"' });
    expect(noticesFor(ryan)[0]!.title).toBe("Maya gave you $5");
  });

  it("refuses non-planters, too little, too much and more than they have", async () => {
    const ryan = service.getUser(DEMO_STREAMER_ID)!;
    const fan = await service.signIn("Maya", "fan");
    await expect(give(ryan, "ryan", 5)).rejects.toThrow("planter");
    await expect(give(fan, "ryan", 0.1)).rejects.toThrow("smallest gift");
    await expect(give(fan, "ryan", 600)).rejects.toThrow("up to $500");
    await expect(give(fan, "ryan", 100)).rejects.toThrow("Not enough");
  });
});
