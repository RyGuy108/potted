import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Keepers rule on disputed clips, so not just anyone may become one. A new
 * account picks Keeper only with the invite code in POTTED_KEEPER_CODE.
 * Without the variable, keeper sign-up is closed (except the name-only
 * demo sign-up while demo accounts are on).
 */
export function keeperCodeConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.POTTED_KEEPER_CODE?.trim());
}

export function keeperCodeOk(code: string, env: Record<string, string | undefined> = process.env): boolean {
  const want = env.POTTED_KEEPER_CODE?.trim();
  if (!want) return false;
  const digest = (s: string) => createHash("sha256").update(s.trim()).digest();
  return timingSafeEqual(digest(code), digest(want));
}
