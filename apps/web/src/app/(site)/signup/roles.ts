/** The three sign-up paths and what each page says. */
export const SIGNUP = [
  {
    path: "planter",
    role: "fan",
    stage: 1,
    label: "Planter",
    blurb: "I watch streams and want to back challenges.",
    detail: "Pledge to challenges, earn levels and badges, get refunded on a miss.",
    title: "Sign up as a planter",
    points: ["Pledge test USDC to challenges you want to see", "Missed challenges refund your pledge, less any up-front share", "Earn levels and badges as your garden grows"],
  },
  {
    path: "climber",
    role: "streamer",
    stage: 4,
    label: "Climber",
    blurb: "I stream and want viewers to fund my challenges.",
    detail: "Open challenges, share your page and overlay, get paid when you deliver.",
    title: "Sign up as a climber",
    points: ["Claim a stream page and an OBS overlay", "Open challenges checked by game data or by clip", "Get paid on completion, or part up front when you start"],
  },
  {
    path: "keeper",
    role: "mod",
    stage: 2,
    label: "Keeper",
    blurb: "I moderate and want to settle disputed clips.",
    detail: "Watch disputed clips and decide whether the pot pays out or goes back.",
    title: "Sign up as a keeper",
    points: ["See every clip a funder has disputed", "Uphold the claim to pay the climber, or reject it to refund fans", "Your rulings are recorded on the challenge"],
  },
] as const;
