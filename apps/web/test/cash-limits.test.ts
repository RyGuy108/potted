import { beforeEach, describe, expect, it } from "vitest";
import { topUpLeft } from "../src/lib/blink-limits";
import * as service from "../src/lib/service";
import { DEMO_STREAMER_ID, resetForTests } from "../src/lib/store";

const streamer = () => service.getUser(DEMO_STREAMER_ID)!;

beforeEach(() => resetForTests());

describe("cash limits that were under $500 are now $500", () => {
  it("lets a climber set a minimum pledge up to $500", async () => {
    await service.updateSettings(streamer(), { ...service.settingsOf(streamer()), minPledgeUsd: 500 });
    expect(service.settingsOf(streamer()).minPledgeUsd).toBe(500);
    await expect(service.updateSettings(streamer(), { ...service.settingsOf(streamer()), minPledgeUsd: 501 })).rejects.toThrow("$0.50 to $500");
  });

  it("gives each wallet up to $500 of test USDC through Blinks", () => {
    expect(topUpLeft("fresh-wallet")).toBe(500_000_000);
  });
});
