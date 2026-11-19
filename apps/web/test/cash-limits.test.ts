import { MAX_USD } from "@potted/core";
import { beforeEach, describe, expect, it } from "vitest";
import { give } from "../src/lib/gifts";
import { setAutopilot } from "../src/lib/scout";
import * as service from "../src/lib/service";
import { DEMO_STREAMER_ID, resetForTests } from "../src/lib/store";

const terms = (goalUsd: number, pledgeCapUsd: number) => ({ gameId: "chess", condition: { kind: "lichess", username: "ryan", speed: "bullet" }, goalUsd, pledgeCapUsd, minutes: 30 });
const streamer = () => service.getUser(DEMO_STREAMER_ID)!;

beforeEach(() => resetForTests());

describe("every cash limit is $500", () => {
  it("is one number", () => expect(MAX_USD).toBe(500));

  it("caps goals, per-fan limits, pledges, campaigns, gifts and the scout", async () => {
    await expect(service.createChallenge(streamer(), terms(501, 10))).rejects.toThrow("Goal must be $1 to $500");
    await expect(service.createChallenge(streamer(), terms(500, 501))).rejects.toThrow("Per-fan limit must be $1 to $500");
    const c = await service.createChallenge(streamer(), terms(500, 500));
    expect(c.goalMicro).toBe(500_000_000);
    const fan = await service.signIn("Ana", "fan");
    await expect(service.startCampaign(streamer(), "Big one", 501)).rejects.toThrow("$0 to $500");
    await expect(give(fan, "ryan", 501)).rejects.toThrow("up to $500");
    await expect(setAutopilot(streamer(), true, 501)).rejects.toThrow("$5 to $500");
  });
});
