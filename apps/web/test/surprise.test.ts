import { beforeEach, describe, expect, it } from "vitest";
import * as service from "@/lib/service";
import { resetForTests } from "@/lib/store";
import { surprisePick } from "@/lib/surprise";

const clip = (statement: string) => ({ gameId: "gta6", condition: { kind: "optimistic", game: "GTA VI", statement, disputeWindowSecs: 60 }, goalUsd: 10, pledgeCapUsd: 10, minutes: 30 });

describe("surprise me", () => {
  beforeEach(() => resetForTests());

  it("picks a live creator the planter hasn't backed, and not the one they just saw", async () => {
    const maya = await service.signIn("Maya", "fan");
    expect(surprisePick(maya)).toBeNull();
    const ryan = service.getStreamer("ryan")!;
    const kai = service.getStreamer("kai")!;
    const backed = await service.createChallenge(ryan, clip("Finish the first heist without getting busted"));
    await service.createChallenge(kai, clip("Win a street race in a garbage truck"));
    await service.pledge(maya, backed.id, 2);
    for (const r of [0, 0.5, 0.99]) expect(surprisePick(maya, undefined, () => r)).toBe("kai");
    // Kai was just shown; with nobody else new, Ryan is fair game.
    expect(surprisePick(maya, "kai", () => 0)).toBe("ryan");
  });
});
