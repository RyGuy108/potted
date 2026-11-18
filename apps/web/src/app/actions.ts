"use server";

import { revalidatePath } from "next/cache";
import * as service from "@/lib/service";
import { currentUser, endSession, startSession } from "@/lib/session";
import { SAMPLE_SIGN_INS } from "@/lib/sample-data";
import * as scouting from "@/lib/scout";
import { DEMO_GUEST_ID, DEMO_STREAMER_ID, type Role } from "@/lib/store";

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

export async function signUpClimberAction(name: string, handle: string): Promise<ActionResult> {
  return run(async () => {
    const user = await service.signUpClimber(String(name), String(handle));
    await startSession(user.id);
  });
}

export async function useDemoStreamerAction(): Promise<ActionResult> {
  return run(() => startSession(DEMO_STREAMER_ID));
}

/** Signs in to one of the demo's ready-made accounts. Only listed accounts can be used this way. */
export async function useDemoAccountAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const allowed = id === DEMO_STREAMER_ID || id === DEMO_GUEST_ID || SAMPLE_SIGN_INS.some((s) => s.id === id);
    if (!allowed || !service.getUser(id)) throw new Error("That demo account is not loaded");
    await startSession(id);
  });
}

/** The second demo streamer, for trying collabs. */
export async function useDemoGuestAction(): Promise<ActionResult> {
  return run(() => startSession(DEMO_GUEST_ID));
}

export async function inviteAction(guestHandle: string, guestPct: number, input: service.NewChallenge): Promise<ActionResult> {
  return run(async () => service.invite(await requireUser(), guestHandle, guestPct, input));
}

export async function respondInviteAction(inviteId: string, accept: boolean): Promise<ActionResult> {
  return run(async () => service.respondInvite(await requireUser(), inviteId, accept));
}

export async function withdrawInviteAction(inviteId: string): Promise<ActionResult> {
  return run(async () => service.withdrawInvite(await requireUser(), inviteId));
}

export async function postBountyAction(input: {
  handle: string;
  gameId: string;
  text: string;
  customGame: string;
  amountUsd: number;
  hours: number;
}): Promise<ActionResult> {
  return run(async () => service.postBounty(await requireUser(), input));
}

export async function backBountyAction(bountyId: string, amountUsd: number): Promise<ActionResult> {
  return run(async () => service.backBounty(await requireUser(), String(bountyId), Number(amountUsd)));
}

export async function acceptBountyAction(bountyId: string, input: service.NewChallenge): Promise<ActionResult> {
  return run(async () => service.acceptBounty(await requireUser(), String(bountyId), input));
}

export async function declineBountyAction(bountyId: string): Promise<ActionResult> {
  return run(async () => service.declineBounty(await requireUser(), String(bountyId)));
}

export async function chooseRoleAction(role: "fan" | "streamer", handle: string): Promise<ActionResult> {
  return run(async () => service.chooseRole(await requireUser(), role === "streamer" ? "streamer" : "fan", String(handle)));
}

export async function signOutAction(): Promise<ActionResult> {
  return run(endSession);
}

export async function createChallengeAction(
  input: service.NewChallenge,
  fromSuggestionId?: string,
): Promise<ActionResult> {
  return run(async () => {
    const user = await requireUser();
    await service.createChallenge(user, {
      gameId: String(input.gameId),
      condition: input.condition,
      goalUsd: Number(input.goalUsd),
      pledgeCapUsd: Number(input.pledgeCapUsd),
      minutes: Number(input.minutes),
      upfrontPct: Number(input.upfrontPct ?? 0),
    });
    if (fromSuggestionId) await service.resolveSuggestion(user, String(fromSuggestionId), "used");
  });
}

export async function recapAction(): Promise<ActionResult> {
  return run(async () => service.announceRecap(await requireUser()));
}

export async function cancelAction(challengeId: string): Promise<ActionResult> {
  return run(async () => service.cancel(await requireUser(), String(challengeId)));
}

export async function runAgainAction(challengeId: string): Promise<ActionResult> {
  return run(async () => service.runAgain(await requireUser(), String(challengeId)));
}

export async function suggestAction(handle: string, gameId: string, text: string, customGame = ""): Promise<ActionResult> {
  return run(async () => service.suggest(await requireUser(), String(handle), String(gameId), String(text), String(customGame)));
}

export async function dismissSuggestionAction(id: string): Promise<ActionResult> {
  return run(async () => service.resolveSuggestion(await requireUser(), String(id), "dismissed"));
}

export async function updateSettingsAction(input: Record<string, unknown>): Promise<ActionResult> {
  return run(async () => service.updateSettings(await requireUser(), input));
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

export async function runScoutAction(): Promise<ActionResult> {
  return run(async () => scouting.runScout(await requireUser()));
}

export async function openPitchAction(index: number): Promise<ActionResult> {
  return run(async () => scouting.openPitch(await requireUser(), index));
}

export async function setAutopilotAction(on: boolean, maxGoalUsd: number): Promise<ActionResult> {
  return run(async () => scouting.setAutopilot(await requireUser(), on, Math.round(Number(maxGoalUsd))));
}
