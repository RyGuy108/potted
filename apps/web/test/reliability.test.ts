import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clientAddress, recordTopUp, resetBlinkLimitsForTests, takeBlinkSlot, topUpLeft } from "../src/lib/blink-limits";
import { backup, claimDataDir } from "../src/lib/ops";
import { runPass } from "../src/lib/scheduler";
import * as service from "../src/lib/service";
import { DEMO_STREAMER_ID, db, resetForTests } from "../src/lib/store";

const CHESS = { gameId: "chess", condition: { kind: "lichess", username: "ryan", speed: "bullet" }, goalUsd: 20, pledgeCapUsd: 15, minutes: 30 };

beforeEach(() => {
  resetForTests();
  resetBlinkLimitsForTests();
});

describe("the background job", () => {
  it("refunds a challenge whose time ran out, with no page load", async () => {
    const c = await service.createChallenge(service.getUser(DEMO_STREAMER_ID)!, CHESS);
    const ana = await service.signIn("Ana", "fan");
    await service.pledge(ana, c.id, 5);
    const before = await service.balanceOf(ana);
    const late = c.settleBy + 1000;
    const real = Date.now;
    Date.now = () => late;
    try {
      const report = await runPass(late);
      expect(report).toMatchObject({ errors: 0 });
      expect(report!.streamers).toBeGreaterThan(0);
    } finally {
      Date.now = real;
    }
    expect(service.getChallenge(c.id).status).toBe("failed");
    expect(await service.balanceOf(ana)).toBe(before + 5_000_000);
  });

  it("never runs two passes at once, and checks one challenge one call at a time", async () => {
    const [a, b] = await Promise.all([runPass(), runPass()]);
    expect([a, b].filter(Boolean)).toHaveLength(1);

    const c = await service.createChallenge(service.getUser(DEMO_STREAMER_ID)!, CHESS);
    const ana = await service.signIn("Ana", "fan");
    await service.pledge(ana, c.id, 5);
    const real = Date.now;
    Date.now = () => c.settleBy + 1000;
    try {
      const seq = service.latestSeq();
      await Promise.all([service.check(c.id), service.check(c.id), service.check(c.id)]);
      expect(service.eventsSince("ryan", seq).filter((e) => e.type === "refunded")).toHaveLength(1);
    } finally {
      Date.now = real;
    }
  });
});

describe("limits on Blink pledges", () => {
  afterEach(() => {
    for (const k of ["POTTED_BLINK_PER_WALLET", "POTTED_BLINK_PER_IP", "POTTED_BLINK_PER_HOUR", "POTTED_BLINK_TOPUP_USD"]) delete process.env[k];
  });

  it("caps each wallet, each network address and everyone together per hour", () => {
    process.env.POTTED_BLINK_PER_WALLET = "2";
    process.env.POTTED_BLINK_PER_IP = "3";
    process.env.POTTED_BLINK_PER_HOUR = "4";
    const t = 1_000_000;
    expect(takeBlinkSlot("w1", "ip1", t)).toBeUndefined();
    expect(takeBlinkSlot("w1", "ip1", t)).toBeUndefined();
    expect(takeBlinkSlot("w1", "ip1", t)).toMatch(/wallet/);
    expect(takeBlinkSlot("w2", "ip1", t)).toBeUndefined();
    expect(takeBlinkSlot("w3", "ip1", t)).toMatch(/network/);
    expect(takeBlinkSlot("w4", "ip2", t)).toBeUndefined();
    expect(takeBlinkSlot("w5", "ip3", t)).toMatch(/a lot of pledges/);
    // An hour later, everything is open again.
    expect(takeBlinkSlot("w1", "ip1", t + 60 * 60_000 + 1)).toBeUndefined();
  });

  it("gives each wallet at most $500 of test USDC, ever", () => {
    expect(topUpLeft("w1")).toBe(500_000_000);
    recordTopUp("w1", 400_000_000);
    expect(topUpLeft("w1")).toBe(100_000_000);
    recordTopUp("w1", 150_000_000);
    expect(topUpLeft("w1")).toBe(0);
    expect(db().blinkTopUps!.w1).toBe(550_000_000);
  });

  it("reads the caller's address from the proxy's header", () => {
    expect(clientAddress(new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } }))).toBe("203.0.113.9");
    expect(clientAddress(new Request("http://x"))).toBe("unknown");
  });
});

describe("one server per data folder", () => {
  it("notices another live server, and keeps 48 hourly backups of data and keys", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "potted-ops-"));
    process.env.POTTED_DATA_DIR = dir;
    fs.writeFileSync(path.join(dir, "server.lock"), JSON.stringify({ id: "other", host: "box2", pid: 9, startedAt: 0, beat: Date.now() }));
    expect(claimDataDir()).toMatchObject({ host: "box2" });
    expect(claimDataDir()).toBeNull();
    fs.writeFileSync(path.join(dir, "potted.json"), "{}");
    fs.writeFileSync(path.join(dir, "wallets.json"), "{}");
    for (let h = 0; h < 50; h++) backup(new Date(Date.UTC(2026, 10, 1, 0) + h * 3_600_000));
    const files = fs.readdirSync(path.join(dir, "backups"));
    expect(files.filter((f) => f.startsWith("potted-"))).toHaveLength(48);
    expect(files.filter((f) => f.startsWith("wallets-"))).toHaveLength(48);
    expect(fs.statSync(path.join(dir, "backups", files.find((f) => f.startsWith("wallets-"))!)).mode & 0o777).toBe(0o600);
    delete process.env.POTTED_DATA_DIR;
  });
});
