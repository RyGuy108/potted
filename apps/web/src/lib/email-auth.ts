import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { db, save } from "./store";

/**
 * Email sign-in with a six-digit code. The code is mailed through Resend
 * when RESEND_API_KEY is set. With no mail service, a development server
 * shows the code on screen instead, so the flow can be tried locally; a
 * production server refuses rather than show it.
 */

export interface EmailDeps {
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
  now?: number;
}

const defaults = (): EmailDeps => ({ fetch: globalThis.fetch, env: process.env });

const TTL_MS = 10 * 60_000;
const MAX_TRIES = 5;
const RESEND_AFTER_MS = 30_000;

export function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error("Enter a valid email address");
  return email;
}

const hash = (email: string, code: string) => createHash("sha256").update(`${email}:${code}`).digest("hex");

export function emailConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.RESEND_API_KEY);
}

/** Whether codes may be shown on screen: only with no mail service, and never in production unless asked for. */
export function showsCodes(env: Record<string, string | undefined> = process.env): boolean {
  if (emailConfigured(env)) return false;
  return env.NODE_ENV !== "production" || env.POTTED_SHOW_EMAIL_CODES === "true";
}

/** Makes and sends a code. Returns the code only when it is shown on screen instead of mailed. */
export async function sendCode(rawEmail: string, deps: EmailDeps = defaults()): Promise<{ shown?: string }> {
  const email = normalizeEmail(rawEmail);
  const now = deps.now ?? Date.now();
  const codes = (db().emailCodes ??= {});
  const last = codes[email];
  if (last && now - last.sentAt < RESEND_AFTER_MS) throw new Error("A code was just sent. Wait a few seconds before asking for another.");
  if (!emailConfigured(deps.env) && !showsCodes(deps.env)) throw new Error("Email sign-in is not connected on this server yet.");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  codes[email] = { hash: hash(email, code), expires: now + TTL_MS, tries: 0, sentAt: now };
  save();
  if (!emailConfigured(deps.env)) return { shown: code };
  const res = await deps.fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${deps.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: deps.env.EMAIL_FROM || "Potted <onboarding@resend.dev>",
      to: [email],
      subject: `${code} is your Potted sign-in code`,
      text: `Your Potted sign-in code is ${code}. It works for 10 minutes. If you did not ask for it, you can ignore this email.`,
    }),
  });
  if (!res.ok) {
    delete codes[email];
    save();
    throw new Error("The sign-in email could not be sent. Try again in a minute.");
  }
  return {};
}

/** Checks a code. Each code works once, for ten minutes, with five tries. Returns the normalized email. */
export function checkCode(rawEmail: string, rawCode: string, now = Date.now()): string {
  const email = normalizeEmail(rawEmail);
  const codes = db().emailCodes ?? {};
  const entry = codes[email];
  if (!entry || entry.expires < now) throw new Error("That code has expired. Ask for a new one.");
  if (entry.tries >= MAX_TRIES) throw new Error("Too many tries. Ask for a new code.");
  entry.tries += 1;
  const given = Buffer.from(hash(email, rawCode.replace(/\s+/g, "")));
  const ok = timingSafeEqual(given, Buffer.from(entry.hash));
  if (ok) delete codes[email];
  save();
  if (!ok) throw new Error(`That code is not right. ${MAX_TRIES - entry.tries} ${MAX_TRIES - entry.tries === 1 ? "try" : "tries"} left.`);
  return email;
}
