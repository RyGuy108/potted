import type { Micro } from "./money";

/** The beanstalk climbs as the pot fills. Purely presentational. */
export const GROWTH_STAGES = ["bean", "sprout", "vine", "beanstalk", "clouds"] as const;
export type GrowthStage = (typeof GROWTH_STAGES)[number];

export interface Growth {
  stage: GrowthStage;
  index: number;
  /** 0 to 1, capped. */
  ratio: number;
}

/** An open pot has no goal: anyone can keep adding until it settles. */
export const isOpenPot = (c: { goalMicro: Micro }) => c.goalMicro <= 0;

/** The per-fan limit an open pot carries, so the escrow program's cap never gets in the way: $1 billion. */
export const OPEN_POT_CAP_MICRO: Micro = 1_000_000_000_000_000;

/** Where an open pot's beanstalk moves up a stage, since it has no goal to measure against. */
const OPEN_STAGES = [1, 25_000_000, 75_000_000, 200_000_000];

export function growthOf(totalMicro: Micro, goalMicro: Micro): Growth {
  if (goalMicro <= 0) {
    // No goal: the stage follows the amount, and the bar fills ever more slowly ($50 is half way).
    const index = OPEN_STAGES.filter((at) => totalMicro >= at).length;
    const ratio = totalMicro > 0 ? 1 - 1 / (1 + totalMicro / 50_000_000) : 0;
    return { stage: GROWTH_STAGES[index]!, index, ratio };
  }
  const ratio = Math.min(1, Math.max(0, totalMicro / goalMicro));
  let index = 0;
  if (ratio >= 1) index = 4;
  else if (ratio >= 2 / 3) index = 3;
  else if (ratio >= 1 / 3) index = 2;
  else if (totalMicro > 0) index = 1;
  return { stage: GROWTH_STAGES[index]!, index, ratio };
}
