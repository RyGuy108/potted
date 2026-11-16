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
  /** Address of the on-chain challenge account, or a sim id. */
  ledgerRef?: string;
  /** Transaction ids by step, for receipts. */
  txs: Partial<Record<"create" | "lock" | "settle", string>>;
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
