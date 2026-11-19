import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getUser } from "./service";
import { type User, sessionSecret } from "./store";

/**
 * Sessions are a cookie holding the user id and a signature over it, so a
 * visitor cannot become someone else by editing the cookie.
 */
const COOKIE = "potted_uid";

function sign(userId: string): string {
  return createHmac("sha256", sessionSecret()).update(userId).digest("base64url");
}

export function sessionToken(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

/** The user id in a session cookie, or undefined if it was not signed by us. */
export function readSessionToken(token: string | undefined): string | undefined {
  if (!token) return undefined;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return undefined;
  const userId = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(userId));
  return given.length === expected.length && timingSafeEqual(given, expected) ? userId : undefined;
}

const EXT_TOKEN_DAYS = 30;

/**
 * A token the browser extension sends with each request in place of a
 * cookie. It names the user and an expiry, and is signed like a session.
 */
export function extToken(userId: string, now = Date.now()): string {
  const body = `ext.${userId}.${now + EXT_TOKEN_DAYS * 24 * 60 * 60_000}`;
  return `${body}.${sign(body)}`;
}

export function readExtToken(token: string | undefined | null, now = Date.now()): string | undefined {
  if (!token) return undefined;
  const dot = token.lastIndexOf(".");
  const body = token.slice(0, dot);
  const [kind, userId, expires] = body.split(".");
  if (kind !== "ext" || !userId || !(Number(expires) > now)) return undefined;
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(body));
  return given.length === expected.length && timingSafeEqual(given, expected) ? userId : undefined;
}

export async function currentUser(): Promise<User | undefined> {
  return getUser(readSessionToken((await cookies()).get(COOKIE)?.value));
}

export async function startSession(userId: string): Promise<void> {
  (await cookies()).set(COOKIE, sessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.POTTED_INSECURE_COOKIES !== "true",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
