import type { Condition } from "./conditions";
import type { Micro } from "./money";

/**
 * open    accepting pledges
 * locked  attempt in progress, no new pledges
 * paid    verified; the pot went to the streamer
 * failed  not achieved; every pledge is refundable
 */
export type ChallengeStatus = "open" | "locked" | "paid" | "failed";

/** A pointer to whatever proves the result, kept with the settlement. */
export interface Evidence {
  source: string;
  ref: string;
  url?: string;
  summary: string;
  /** True when a rehearsal tool forced the result. Never shown as real. */
  simulated?: boolean;
  /** True for the sample history added for demos. No game data was checked. */
  sample?: boolean;
}

export interface Verdict {
  outcome: "success" | "failure" | "pending";
  reason: string;
  evidence?: Evidence;
}

export interface OptimisticClaim {
  clipUrl: string;
  claimedAt: number;
  /** User ids of funders who disputed. */
  disputedBy: string[];
  ruling?: "upheld" | "rejected";
  /** The keeper who ruled, and when. */
  ruledBy?: string;
  ruledAt?: number;
}

export interface Challenge {
  id: string;
  streamerId: string;
  title: string;
  gameId: string;
  condition: Condition;
  status: ChallengeStatus;
  /** The pot size at which the beanstalk reaches the clouds. Not a minimum. */
  goalMicro: Micro;
  /** Most a single fan can put in. */
  pledgeCapMicro: Micro;
  totalMicro: Micro;
  createdAt: number;
  /** The attempt must finish by this time (ms). */
  deadline: number;
  /** After this time (ms) anyone can trigger refunds. */
  settleBy: number;
  lockedAt?: number;
  /** Adapter-specific snapshot taken at lock, e.g. Fortnite totals. */
  baseline?: unknown;
  claim?: OptimisticClaim;
  verdict?: Verdict;
  settledAt?: number;
  /**
   * Who else is paid when the challenge succeeds. Fixed when the challenge
   * opens, so fans always pledge against known terms. The streamer who
   * created it keeps whatever the splits leave.
   */
  splits?: Split[];
  /** Whole percent of the pot paid to the streamer when the attempt starts. The rest is paid only on success. */
  upfrontPct?: number;
  /** What was actually paid up front when the attempt started. */
  upfrontPaidMicro?: Micro;
  /** The fan request (bounty) this challenge came from, if any. */
  bountyId?: string;
  /** Money fans put on the request. Paid to the climber when the attempt starts, whatever the result; not part of the pot. */
  requestMicro?: number;
  /** How much of the request money has been paid to the climber. */
  requestPaidMicro?: number;
  /** The streamer's campaign this challenge belongs to, if one was running when it opened. */
  campaignId?: string;
  /** Set when Grok drafted the terms (from a fan's idea or a scout pitch) and the climber opened them. */
  draftedBy?: "grok";
  /** Address of the on-chain challenge account, or a sim id. */
  ledgerRef?: string;
  /** Transaction ids by step, for receipts. */
  txs: Partial<Record<"create" | "lock" | "settle", string>>;
}

/** A share of a successful pot that goes to someone other than the host. */
export interface Split {
  /** "guest" is another streamer taking part; "cause" is a charity or fund. */
  kind: "guest" | "cause";
  /** The guest's user id. Causes have none. */
  userId?: string;
  name: string;
  /** Whole percent of the pot, 1 to 99. */
  pct: number;
  url?: string;
  /** A cause's own Solana address, when the streamer gave one. */
  wallet?: string;
}

/**
 * Divides a pot. Each split is rounded down to the micro-dollar and the
 * host receives the remainder, so the parts always add up to the pot.
 */
export function splitPot(totalMicro: Micro, splits: readonly Split[] = []): { hostMicro: Micro; parts: Micro[] } {
  const parts = splits.map((s) => Math.floor((totalMicro * s.pct) / 100));
  return { hostMicro: totalMicro - parts.reduce((sum, p) => sum + p, 0), parts };
}

/** Splits must leave the host something and name whole percents. */
export function splitsError(splits: readonly Split[]): string | null {
  if (splits.some((s) => !Number.isInteger(s.pct) || s.pct < 1 || s.pct > 99)) return "Each share must be a whole percent from 1 to 99";
  if (splits.reduce((sum, s) => sum + s.pct, 0) > 90) return "Shares can add up to 90% at most, so the host keeps at least 10%";
  return null;
}

export interface Pledge {
  id: string;
  challengeId: string;
  userId: string;
  amountMicro: Micro;
  refunded: boolean;
  createdAt: number;
  tx: string;
  refundTx?: string;
  /** What actually came back. Less than the pledge when part was paid up front. */
  refundMicro?: Micro;
}

/** The most of a pot that can go to the streamer before the result. Matches the escrow program. */
export const MAX_UPFRONT_PCT = 50;

/** The up-front payment for a pot: rounded down, as the escrow program does. */
export function upfrontOf(totalMicro: Micro, pct: number): Micro {
  return Math.floor((totalMicro * pct) / 100);
}

/**
 * What a fan keeps with the streamer from a refunded pledge when the
 * up-front share was paid: rounded up, so the refunds can never ask for
 * more than the rounded-down remainder in the vault.
 */
export function keptOnRefund(pledgedMicro: Micro, pct: number): Micro {
  return Math.ceil((pledgedMicro * pct) / 100);
}

export function canPledge(c: Pick<Challenge, "status" | "deadline">, now: number): boolean {
  return c.status === "open" && now < c.deadline;
}

export function canLock(c: Pick<Challenge, "status" | "deadline">, now: number): boolean {
  return c.status === "open" && now < c.deadline;
}

export function canSettle(c: Pick<Challenge, "status" | "settleBy">, now: number): boolean {
  return (c.status === "open" || c.status === "locked") && now <= c.settleBy;
}

/**
 * Why a challenge is refundable right now, or null if it is not.
 * "expired" is the safety net: no result arrived by settleBy.
 */
export function refundReason(
  c: Pick<Challenge, "status" | "settleBy">,
  now: number,
): "failed" | "expired" | null {
  if (c.status === "failed") return "failed";
  if ((c.status === "open" || c.status === "locked") && now > c.settleBy) return "expired";
  return null;
}

/** Checks a pledge against the per-fan cap. Returns an error message or null. */
export function pledgeError(
  c: Pick<Challenge, "status" | "deadline" | "pledgeCapMicro">,
  alreadyPledgedMicro: Micro,
  amountMicro: Micro,
  now: number,
): string | null {
  if (!canPledge(c, now)) return "This challenge is no longer taking pledges";
  if (!Number.isInteger(amountMicro) || amountMicro <= 0) return "Enter an amount above zero";
  if (alreadyPledgedMicro + amountMicro > c.pledgeCapMicro) return "That goes over the per-fan limit";
  return null;
}
