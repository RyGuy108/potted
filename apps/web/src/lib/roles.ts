import type { Role } from "./store";

/**
 * What each kind of account is called. Fans plant the beans, streamers
 * climb the beanstalk, moderators keep the garden. The ids in the data
 * stay "fan", "streamer" and "mod"; only the words people see change.
 */
export const ROLES: Record<Role, { label: string; plural: string; blurb: string }> = {
  fan: { label: "Planter", plural: "Planters", blurb: "You back challenges. Every pledge is a bean in the pot." },
  streamer: { label: "Climber", plural: "Climbers", blurb: "You take the challenges on, live. The pot is yours if you make it." },
  mod: { label: "Keeper", plural: "Keepers", blurb: "You review disputed clips and make the call." },
};
