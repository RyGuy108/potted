import { timingSafeEqual } from "node:crypto";
import { DEMO_LOGINS } from "./sample-data";

/**
 * Email sign-in for the seeded demo accounts (planter@demo.potted and the
 * others in DEMO_LOGINS). No mail is sent: the code is whatever the
 * server's POTTED_DEMO_CODE says, so the sign-in looks and works like the
 * real one in a recording. Without that variable, or once the demo seed
 * is removed, these addresses cannot sign in at all.
 */

const MAX_FAILS = 10;
const WINDOW_MS = 10 * 60_000;
const fails = new Map<string, { count: number; since: number }>();

export function isDemoLogin(email: string): boolean {
  return DEMO_LOGINS.some((l) => l.email === email);
}

/** The demo code, when one is set and long enough to not be guessed in ten tries. */
export function demoCode(env: Record<string, string | undefined> = process.env): string | null {
  const code = env.POTTED_DEMO_CODE?.trim();
  return code && code.length >= 6 ? code : null;
}

/** Step one for a demo address: nothing to send, but refuse when demo sign-in is closed. */
export function demoCodeReady(env: Record<string, string | undefined> = process.env): void {
  if (!demoCode(env)) throw new Error("Demo sign-in is not set up on this server.");
}

/** Step two for a demo address: checks the code against POTTED_DEMO_CODE, with a limit on wrong tries. */
export function checkDemoCode(email: string, given: string, now = Date.now(), env: Record<string, string | undefined> = process.env): void {
  const code = demoCode(env);
  if (!code) throw new Error("Demo sign-in is not set up on this server.");
  const entry = fails.get(email);
  if (entry && now - entry.since > WINDOW_MS) fails.delete(email);
  const current = fails.get(email);
  if (current && current.count >= MAX_FAILS) throw new Error("Too many tries. Wait ten minutes and try again.");
  const a = Buffer.from(given.trim());
  const b = Buffer.from(code);
  if (a.length === b.length && timingSafeEqual(a, b)) {
    fails.delete(email);
    return;
  }
  fails.set(email, { count: (current?.count ?? 0) + 1, since: current?.since ?? now });
  throw new Error("That code is not right.");
}
