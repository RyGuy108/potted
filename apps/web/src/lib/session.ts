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
