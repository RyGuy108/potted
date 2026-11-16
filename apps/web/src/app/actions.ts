"use server";

import { revalidatePath } from "next/cache";
import * as service from "@/lib/service";
import { currentUser, endSession, startSession } from "@/lib/session";
import { DEMO_STREAMER_ID, type Role } from "@/lib/store";

/** Expected failures come back as values so forms can show them inline. */
export type ActionResult = { ok: true } | { ok: false; error: string };

async function run(work: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await work();
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Error("Sign in first");
  return user;
}

export async function signInAction(name: string, role: Role): Promise<ActionResult> {
  return run(async () => {
    const user = await service.signIn(String(name), role === "mod" ? "mod" : "fan");
    await startSession(user.id);
  });
}

export async function useDemoStreamerAction(): Promise<ActionResult> {
  return run(() => startSession(DEMO_STREAMER_ID));
}

export async function signOutAction(): Promise<ActionResult> {
  return run(endSession);
}

export async function createChallengeAction(input: service.NewChallenge): Promise<ActionResult> {
  return run(async () =>
    service.createChallenge(await requireUser(), {
      gameId: String(input.gameId),
      condition: input.condition,
      goalUsd: Number(input.goalUsd),
      pledgeCapUsd: Number(input.pledgeCapUsd),
      minutes: Number(input.minutes),
    }),
  );
}

export async function pledgeAction(challengeId: string, amountUsd: number): Promise<ActionResult> {
  return run(async () => service.pledge(await requireUser(), String(challengeId), Number(amountUsd)));
}

export async function lockAction(challengeId: string): Promise<ActionResult> {
  return run(async () => service.lock(await requireUser(), String(challengeId)));
}

/** Manual "check now". Anyone may trigger a check; it only reads game data. */
export async function checkAction(challengeId: string): Promise<ActionResult> {
  return run(() => service.check(String(challengeId), { force: true }));
}

/** Quiet background check used by pages that are open during an attempt. */
export async function pollAction(challengeId: string): Promise<void> {
  try {
    await service.check(String(challengeId));
  } catch {
    // The next poll retries; the page shows the last known state.
  }
}

export async function claimAction(challengeId: string, clipUrl: string): Promise<ActionResult> {
  return run(async () => service.claim(await requireUser(), String(challengeId), String(clipUrl)));
}

export async function disputeAction(challengeId: string): Promise<ActionResult> {
  return run(async () => service.dispute(await requireUser(), String(challengeId)));
}

export async function ruleAction(challengeId: string, upheld: boolean): Promise<ActionResult> {
  return run(async () => service.rule(await requireUser(), String(challengeId), upheld === true));
}

export async function simulateAction(challengeId: string, success: boolean): Promise<ActionResult> {
  return run(async () => service.simulateResult(await requireUser(), String(challengeId), success === true));
}
