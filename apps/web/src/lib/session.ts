import { cookies } from "next/headers";
import { getUser } from "./service";
import type { User } from "./store";

/**
 * Judge-mode sessions: a cookie holding the user id, no password. Fine for a
 * devnet demo; real sign-in (email with an embedded wallet) replaces this.
 */
const COOKIE = "potted_uid";

export async function currentUser(): Promise<User | undefined> {
  return getUser((await cookies()).get(COOKIE)?.value);
}

export async function startSession(userId: string): Promise<void> {
  (await cookies()).set(COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
