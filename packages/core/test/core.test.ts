import { describe, expect, it } from "vitest";
import {
  canSettle,
  describeCondition,
  formatUsd,
  growthOf,
  normalizeBrawlTag,
  parseCondition,
  pledgeError,
  refundReason,
  toMicro,
} from "../src";

describe("money", () => {
  it("converts and formats", () => {
    expect(toMicro(2.5)).toBe(2_500_000);
    expect(formatUsd(5_000_000)).toBe("$5");
    expect(formatUsd(2_500_000)).toBe("$2.50");
    expect(() => toMicro(-1)).toThrow();
  });
});

describe("conditions", () => {
  it("parses a Lichess condition with defaults", () => {
    const c = parseCondition({ kind: "lichess", username: "ryan_plays", speed: "bullet" });
    expect(c).toMatchObject({ kind: "lichess", goal: "win_next_rated", minPlies: 20 });
    expect(describeCondition(c)).toBe("ryan_plays wins their next rated bullet game on Lichess");
  });

  it("normalizes Brawl Stars tags and bounds wins by battles", () => {
    expect(normalizeBrawlTag("#2pol0")).toBe("2P0L0");
    expect(() => parseCondition({ kind: "brawlstars", playerTag: "2PP", wins: 4, battles: 3 })).toThrow();
    const c = parseCondition({ kind: "brawlstars", playerTag: "#2pp", wins: 3, battles: 5 });
    expect(describeCondition(c)).toBe("#2PP wins 3 of their next 5 Brawl Stars battles");
  });

  it("rejects unknown kinds and bad usernames", () => {
    expect(() => parseCondition({ kind: "nope" })).toThrow("Unknown verifier kind");
    expect(() => parseCondition({ kind: "lichess", username: "a b" })).toThrow();
  });
});

describe("challenge rules", () => {
  const base = { status: "open" as const, deadline: 1000, settleBy: 2000, pledgeCapMicro: toMicro(10) };

  it("enforces the per-fan cap and the deadline", () => {
    expect(pledgeError(base, toMicro(8), toMicro(2), 500)).toBeNull();
    expect(pledgeError(base, toMicro(8), toMicro(3), 500)).toMatch(/limit/);
    expect(pledgeError(base, 0, toMicro(1), 1000)).toMatch(/no longer/);
  });

  it("only refunds failed or expired challenges", () => {
    expect(refundReason(base, 1500)).toBeNull();
    expect(refundReason(base, 2001)).toBe("expired");
    expect(refundReason({ ...base, status: "failed" }, 10)).toBe("failed");
    expect(refundReason({ ...base, status: "paid" }, 9999)).toBeNull();
  });

  it("stops settlement after settleBy so it cannot race refunds", () => {
    expect(canSettle({ ...base, status: "locked" }, 2000)).toBe(true);
    expect(canSettle({ ...base, status: "locked" }, 2001)).toBe(false);
    expect(canSettle({ ...base, status: "paid" }, 10)).toBe(false);
  });
});

describe("growth", () => {
  it("moves through the five stages", () => {
    const goal = toMicro(30);
    expect(growthOf(0, goal).stage).toBe("bean");
    expect(growthOf(toMicro(1), goal).stage).toBe("sprout");
    expect(growthOf(toMicro(10), goal).stage).toBe("vine");
    expect(growthOf(toMicro(20), goal).stage).toBe("beanstalk");
    expect(growthOf(toMicro(45), goal)).toMatchObject({ stage: "clouds", ratio: 1 });
  });
});

describe("payout splits", () => {
  it("rounds shares down and gives the host the remainder", async () => {
    const { splitPot } = await import("../src/challenge");
    const splits = [
      { kind: "guest" as const, userId: "u2", name: "Kai", pct: 33 },
      { kind: "cause" as const, name: "Fund", pct: 33 },
    ];
    const { hostMicro, parts } = splitPot(1_000_001, splits);
    expect(parts).toEqual([330_000, 330_000]);
    expect(hostMicro + parts[0]! + parts[1]!).toBe(1_000_001);
    expect(splitPot(5_000_000)).toEqual({ hostMicro: 5_000_000, parts: [] });
  });

  it("rejects fractional shares and splits that leave the host under 10%", async () => {
    const { splitsError } = await import("../src/challenge");
    const guest = (pct: number) => ({ kind: "guest" as const, userId: "u2", name: "Kai", pct });
    expect(splitsError([guest(50)])).toBeNull();
    expect(splitsError([guest(12.5)])).toContain("whole percent");
    expect(splitsError([guest(0)])).toContain("whole percent");
    expect(splitsError([guest(60), guest(40)])).toContain("90%");
  });
});

describe("up-front share", () => {
  it("pays up front rounded down and keeps on refund rounded up, so the vault always covers refunds", async () => {
    const { upfrontOf, keptOnRefund } = await import("../src/challenge");
    expect(upfrontOf(1_000_004, 25)).toBe(250_001);
    expect(keptOnRefund(1_000_001, 25)).toBe(250_001);
    expect(keptOnRefund(3, 25)).toBe(1);
    // For any split of a pot among fans, refunds never exceed what is left.
    for (const pledges of [[1, 1, 1], [3, 1_000_001], [7, 9, 11, 13], [5_000_000]]) {
      for (const pct of [10, 25, 33, 50]) {
        const total = pledges.reduce((a, b) => a + b, 0);
        const refunds = pledges.reduce((sum, p) => sum + p - keptOnRefund(p, pct), 0);
        expect(refunds).toBeLessThanOrEqual(total - upfrontOf(total, pct));
      }
    }
  });
});
