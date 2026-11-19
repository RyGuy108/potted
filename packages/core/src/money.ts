/** Amounts are integer micro-USDC (6 decimals), the unit the token uses. */
export type Micro = number;

export const USDC_DECIMALS = 6;
const MICRO_PER_USD = 10 ** USDC_DECIMALS;

export function toMicro(usd: number): Micro {
  if (!Number.isFinite(usd) || usd < 0) throw new Error(`Invalid USD amount: ${usd}`);
  return Math.round(usd * MICRO_PER_USD);
}

export function toUsd(micro: Micro): number {
  return micro / MICRO_PER_USD;
}

/** "$5" for whole dollars, "$2.50" otherwise. */
export function formatUsd(micro: Micro): string {
  const usd = toUsd(micro);
  return Number.isInteger(usd) ? `$${usd}` : `$${usd.toFixed(2)}`;
}

/**
 * The most any single amount can be, in dollars: a goal, a per-fan limit,
 * one pledge, a campaign target, a gift, a bounty backing, the scout's goal
 * limit. One number so every limit moves together.
 */
export const MAX_USD = 500;
