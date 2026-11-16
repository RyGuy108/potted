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
