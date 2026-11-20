import { beforeEach, describe, expect, it } from "vitest";
import { climberBoard } from "../src/lib/leaderboard";
import * as service from "../src/lib/service";
import { DEMO_STREAMER_ID, resetForTests } from "../src/lib/store";

beforeEach(() => resetForTests());

const terms = () => ({
  gameId: "gta6",
  condition: { kind: "optimistic", game: "GTA VI", statement: "Do the thing on stream", disputeWindowSecs: 60 },
  goalUsd: 100,
  pledgeCapUsd: 100,
  minutes: 30,
});

describe("climber leaderboard", () => {
  it("ranks climbers by distinct planters, not by money, and never carries earnings", async () => {
    const demo = service.getUser(DEMO_STREAMER_ID)!;
    const other = await service.signUpClimber("Other", "otherclimber");
    const [ana, ben, cy] = await Promise.all(["Ana", "Ben", "Cy"].map((n) => service.signIn(n, "fan")));

    // One planter, a lot of money.
    const big = await service.createChallenge(demo, terms());
    await service.pledge(ana!, big.id, 9);
    // Three planters, a little money each; the same planter twice still counts once.
    const small = await service.createChallenge(other, terms());
    await service.pledge(ana!, small.id, 1);
    await service.pledge(ben!, small.id, 1);
    await service.pledge(cy!, small.id, 1);
    await service.pledge(cy!, small.id, 1);

    const board = climberBoard();
    expect(board.map((r) => [r.user.id, r.planters, r.rank])).toEqual([
      [other.id, 3, 1],
      [demo.id, 1, 2],
    ]);
    for (const row of board) {
      expect(Object.keys(row).some((k) => /earned|raised|micro|usd/i.test(k))).toBe(false);
    }
  });
});
