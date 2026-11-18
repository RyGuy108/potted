import { keptOnRefund } from "@potted/core";
import { beforeEach, describe, expect, it } from "vitest";
import { authorizeUrl } from "../src/lib/oauth";
import { addSampleHistory, removeSample } from "../src/lib/sample-data";
import * as service from "../src/lib/service";
import { DEMO_STREAMER_ID, db, resetForTests } from "../src/lib/store";

beforeEach(() => resetForTests());

describe("sign-in", () => {
  it("always asks the provider which account to use", () => {
    const env = { GOOGLE_CLIENT_ID: "g", GOOGLE_CLIENT_SECRET: "s", TWITCH_CLIENT_ID: "t", TWITCH_CLIENT_SECRET: "s", DISCORD_CLIENT_ID: "d", DISCORD_CLIENT_SECRET: "s" };
    expect(new URL(authorizeUrl("google", "http://cb", "x", env)).searchParams.get("prompt")).toBe("select_account");
    expect(new URL(authorizeUrl("twitch", "http://cb", "x", env)).searchParams.get("force_verify")).toBe("true");
    expect(new URL(authorizeUrl("discord", "http://cb", "x", env)).searchParams.get("prompt")).toBe("consent");
  });

  it("signs up a demo climber with their own stream address", async () => {
    const climber = await service.signUpClimber("Lark", "@LarkLive");
    expect(climber).toMatchObject({ role: "streamer", handle: "larklive" });
    expect(service.getStreamer("larklive")?.id).toBe(climber.id);
    await expect(service.signUpClimber("Copy", "larklive")).rejects.toThrow("taken");
    await expect(service.signUpClimber("Ryan2", "ryan")).rejects.toThrow("taken");
    await expect(service.signUpClimber("X", "ok_handle")).rejects.toThrow("at least 2");
  });
});

describe("demo sample", () => {
  it("adds a history whose money adds up", () => {
    const now = Date.now();
    const history = addSampleHistory(db(), now);
    expect(history.challenges.length).toBeGreaterThan(60);
    const state = db();
    for (const c of history.challenges) {
      const mine = state.pledges.filter((p) => p.challengeId === c.id);
      expect(mine.reduce((sum, p) => sum + p.amountMicro, 0)).toBe(c.totalMicro);
      expect(c.status === "paid" || c.status === "failed").toBe(true);
      expect(c.createdAt).toBeLessThan(now);
      if (c.verdict?.evidence) expect(c.verdict.evidence.sample).toBe(true);
      if (c.status === "failed") {
        expect(mine.every((p) => p.refunded)).toBe(true);
        // Each fan gets back their pledges less the up-front share, as refundAll does.
        const byFan = new Map<string, number>();
        for (const p of mine) byFan.set(p.userId, (byFan.get(p.userId) ?? 0) + p.amountMicro);
        for (const [fan, pledged] of byFan) {
          const back = mine.filter((p) => p.userId === fan).reduce((sum, p) => sum + service.returnedOf(p), 0);
          expect(back).toBe(pledged - (c.upfrontPaidMicro ? keptOnRefund(pledged, c.upfrontPct ?? 0) : 0));
        }
      }
    }
    const maya = service.getUser("u_s_maya")!;
    expect(service.planterStats(maya, now).streakDays).toBeGreaterThanOrEqual(7);
    expect(service.keeperStats(service.getUser("u_s_hazel")!).ruled.length).toBeGreaterThan(3);
    expect(service.climberStats(service.getUser(DEMO_STREAMER_ID)!).total).toBeGreaterThan(5);
  });

  it("comes out again without touching anything else", async () => {
    const fan = await service.signIn("Real fan", "fan");
    const ryan = service.getUser(DEMO_STREAMER_ID)!;
    const own = await service.createChallenge(ryan, { gameId: "gta6", condition: { kind: "optimistic", game: "GTA VI", statement: "x" }, goalUsd: 10, pledgeCapUsd: 10, minutes: 30 });
    await service.pledge(fan, own.id, 2);
    addSampleHistory(db());
    addSampleHistory(db()); // a second run replaces the first
    expect(db().users.filter((u) => u.id === "u_s_maya")).toHaveLength(1);
    removeSample(db());
    expect(db().challenges.map((c) => c.id)).toEqual([own.id]);
    expect(db().pledges).toHaveLength(1);
    expect(db().users.map((u) => u.name).sort()).toEqual(["Kai", "Real fan", "Ryan"]);
  });
});
