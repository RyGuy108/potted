import { beforeEach, describe, expect, it } from "vitest";
import { autopilotTick, chainDigest, openPitch, runScout, scoutInput, scoutOf, setAutopilot } from "../src/lib/scout";
import * as service from "../src/lib/service";
import { DEMO_STREAMER_ID, db, resetForTests } from "../src/lib/store";

const clip = (statement: string) => ({ kind: "optimistic", game: "GTA VI", statement, disputeWindowSecs: 60 });

beforeEach(() => {
  resetForTests();
  delete process.env.XAI_API_KEY;
});

describe("scout in the app", () => {
  it("builds its input from the climber's record and the chain", async () => {
    const ryan = service.getUser(DEMO_STREAMER_ID)!;
    const c = await service.createChallenge(ryan, { gameId: "gta6", condition: clip("Finish the heist"), goalUsd: 10, pledgeCapUsd: 10, minutes: 30 });
    const fan = await service.signIn("Maya", "fan");
    await service.pledge(fan, c.id, 10);
    db().chain.push({ key: "k1", signature: "s", slot: 1, at: Date.now(), name: "Pledged", challenge: c.ledgerRef!, fields: { amount: "10000000", totalPledged: "10000000" } });
    const input = scoutInput(ryan);
    expect(input.games[0]).toMatchObject({ id: "gta6", challenges: 1, averagePotUsd: 10, accountKnown: true });
    expect(input.games[0]!.minutesToGoal).not.toBeNull();
    expect(chainDigest(ryan)).toMatchObject({ pledges: 1, pledgedUsd: 10, biggestPotUsd: 10 });
  });

  it("opens a pitch through the normal checks, once", async () => {
    const ryan = service.getUser(DEMO_STREAMER_ID)!;
    const run = await runScout(ryan);
    expect(run.source).toBe("rules");
    expect(run.pitches.length).toBeGreaterThan(0);
    const challenge = await openPitch(ryan, 0);
    expect(challenge.streamerId).toBe(ryan.id);
    expect(challenge.goalMicro).toBe(run.pitches[0]!.goalUsd * 1_000_000);
    expect(scoutOf(ryan.id)!.opened[0]).toBe(challenge.id);
    await expect(openPitch(ryan, 0)).rejects.toThrow("already open");
    const fan = await service.signIn("Maya", "fan");
    await expect(runScout(fan)).rejects.toThrow("Only a climber");
  });

  it("autopilot opens the next pitch only when the stage is empty, and announces it", async () => {
    const ryan = service.getUser(DEMO_STREAMER_ID)!;
    const fan = await service.signIn("Maya", "fan");
    await service.suggest(fan, "ryan", "gta6", "Win a street race without hitting a wall");
    const run = await runScout(ryan);
    expect(run.pitches.length).toBeGreaterThanOrEqual(2);
    expect(await autopilotTick(ryan)).toBeUndefined(); // off by default
    await setAutopilot(ryan, true, 100);
    const opened = await autopilotTick(ryan);
    expect(opened).toBeDefined();
    expect(db().events.at(-1)!.message).toContain("The scout picked this one");
    // Something is live now, so nothing else opens.
    expect(await autopilotTick(ryan)).toBeUndefined();
    await service.cancel(ryan, opened!.id);
    // It waits between challenges.
    expect(await autopilotTick(ryan)).toBeUndefined();
    expect(await autopilotTick(ryan, Date.now() + 4 * 60_000)).toBeDefined();
    await expect(setAutopilot(ryan, true, 2)).rejects.toThrow("goal limit");
  });

  it("keeps the autopilot setting when stream settings are saved", async () => {
    const ryan = service.getUser(DEMO_STREAMER_ID)!;
    await setAutopilot(ryan, true, 40);
    await service.updateSettings(ryan, { minPledgeUsd: 1, overlayPosition: "bottom-left" });
    expect(service.settingsOf(ryan)).toMatchObject({ autopilot: true, scoutMaxGoalUsd: 40 });
  });
});
