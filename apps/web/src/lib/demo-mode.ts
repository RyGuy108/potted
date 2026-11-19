/**
 * Whether the ready-made demo accounts are offered: the six test accounts,
 * the demo climbers Ryan and Kai, one-click demo logins and the name-only
 * "try the demo" sign-ups for planters and climbers.
 *
 * Set POTTED_DEMO_ACCOUNTS to "on" or "off". When it is not set they are
 * on everywhere except the hosted Railway production server, which starts
 * with real accounts only (people sign up with email, Google, Twitch or
 * Discord). Keeper sign-up stays name-only either way.
 */
export function demoAccountsOn(env: Record<string, string | undefined> = process.env): boolean {
  const set = env.POTTED_DEMO_ACCOUNTS;
  if (set === "on") return true;
  if (set === "off") return false;
  return !onRailwayProduction(env);
}

/** The live server: Railway's production environment. */
export function onRailwayProduction(env: Record<string, string | undefined> = process.env): boolean {
  return env.RAILWAY_ENVIRONMENT_NAME === "production";
}
