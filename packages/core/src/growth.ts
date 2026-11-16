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

export function growthOf(totalMicro: Micro, goalMicro: Micro): Growth {
  const ratio = goalMicro > 0 ? Math.min(1, Math.max(0, totalMicro / goalMicro)) : 0;
  let index = 0;
  if (ratio >= 1) index = 4;
  else if (ratio >= 2 / 3) index = 3;
  else if (ratio >= 1 / 3) index = 2;
  else if (totalMicro > 0) index = 1;
  return { stage: GROWTH_STAGES[index]!, index, ratio };
}
