"use server";

import { revalidatePath } from "next/cache";
import { checkCode, sendCode } from "@/lib/email-auth";
import { cloneVoice, deleteVoice } from "@/lib/elevenlabs";
import * as service from "@/lib/service";
import { currentUser, endSession, startSession } from "@/lib/session";
import { SAMPLE_SIGN_INS } from "@/lib/sample-data";
import { isTestAccount } from "@/lib/test-accounts";
import { demoAccountsOn } from "@/lib/demo-mode";
import * as scouting from "@/lib/scout";
import * as points from "@/lib/points";
import * as gifts from "@/lib/gifts";
import * as notifications from "@/lib/notifications";
import { DEMO_GUEST_ID, DEMO_STREAMER_ID, type Role } from "@/lib/store";

/** Expected failures come back as values so forms can show them inline. */
export type ActionResult = { ok: true; pledgeId?: string } | { ok: false; error: string };

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
    // Name-only accounts: keepers always, planters only while demo accounts are on.
    if (role !== "mod" && !demoAccountsOn()) throw new Error("Sign up with email, Google, Twitch or Discord");
    const user = await service.signIn(String(name), role === "mod" ? "mod" : "fan");
    await startSession(user.id);
  });
}

export async function signUpClimberAction(name: string, handle: string): Promise<ActionResult> {
  return run(async () => {
    if (!demoAccountsOn()) throw new Error("Sign up with email, Google, Twitch or Discord");
    const user = await service.signUpClimber(String(name), String(handle));
    await startSession(user.id);
  });
}

export async function useDemoStreamerAction(): Promise<ActionResult> {
  return run(async () => {
    if (!demoAccountsOn() || !service.getUser(DEMO_STREAMER_ID)) throw new Error("Demo accounts are off on this server");
    await startSession(DEMO_STREAMER_ID);
  });
}

/** Signs in to one of the demo's ready-made accounts. Only listed accounts can be used this way. */
export async function useDemoAccountAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const allowed = id === DEMO_STREAMER_ID || id === DEMO_GUEST_ID || SAMPLE_SIGN_INS.some((s) => s.id === id) || isTestAccount(id);
    if (!allowed || !demoAccountsOn() || !service.getUser(id)) throw new Error("That demo account is not loaded");
    await startSession(id);
  });
}

/** The second demo streamer, for trying collabs. */
export async function useDemoGuestAction(): Promise<ActionResult> {
  return run(async () => {
    if (!demoAccountsOn() || !service.getUser(DEMO_GUEST_ID)) throw new Error("Demo accounts are off on this server");
    await startSession(DEMO_GUEST_ID);
  });
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
      open: input.open === true,
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

/**
 * Clones the streamer's own voice from their recordings for the announcer.
 * The consent box must be ticked; the time of consent is kept with the voice.
 */
export async function cloneVoiceAction(form: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await requireUser();
    if (user.role !== "streamer") throw new Error("Only a streamer can set an announcer voice");
    const consent = form.get("consent") === "on";
    if (!consent) throw new Error("Confirm that the recordings are your own voice and that you agree to cloning it");
    const samples = form.getAll("samples").filter((f): f is File => f instanceof File && f.size > 0);
    const old = service.settingsOf(user).ownVoice?.id;
    const id = await cloneVoice(user.name, samples);
    service.setOwnVoice(user, id, consent);
    if (old && old !== id) await deleteVoice(old).catch(() => undefined);
  });
}

/** Deletes the streamer's cloned voice from ElevenLabs and from Potted. */
export async function removeVoiceAction(): Promise<ActionResult> {
  return run(async () => {
    const id = service.clearOwnVoice(await requireUser());
    if (id) await deleteVoice(id);
  });
}

/** A climber pastes their stream's link to show they are live; Potted fills in the rest. */
export async function goLiveAction(link: string): Promise<ActionResult> {
  return run(async () => service.goLive(await requireUser(), String(link)));
}

export async function endStreamAction(): Promise<ActionResult> {
  return run(async () => service.endStream(await requireUser()));
}

/** Puts the planter's earned badges into their Solana wallet as soulbound tokens. */
export async function mintBadgesAction(): Promise<ActionResult> {
  return run(async () => {
    const { publicBase } = await import("@/lib/url");
    await service.mintBadges(await requireUser(), await publicBase());
  });
}

/** Turns the !potted chat bot on or off, or disconnects one platform. */
export async function chatBotAction(change: { on?: boolean; disconnect?: "kick" | "youtube"; test?: boolean }): Promise<{ ok: true; sent?: string[] } | { ok: false; error: string }> {
  try {
    const user = await requireUser();
    if (user.role !== "streamer") throw new Error("Only climbers have a chat bot");
    const bot = await import("@/lib/chat-bot");
    if (change.on !== undefined) await service.updateSettings(user, { ...service.settingsOf(user), chatBot: change.on });
    if (change.disconnect) bot.disconnect(user, change.disconnect);
    if (change.test) {
      const reply = bot.replyTo(user, "!potted") ?? "";
      return { ok: true, sent: await bot.announce(user, reply) };
    }
    revalidatePath("/dashboard/channel");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

export async function pledgeAction(challengeId: string, amountUsd: number): Promise<ActionResult> {
  let pledgeId: string | undefined;
  const result = await run(async () => {
    pledgeId = (await service.pledge(await requireUser(), String(challengeId), Number(amountUsd))).id;
  });
  return result.ok && pledgeId ? { ok: true, pledgeId } : result;
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

export async function redeemAction(handle: string, rewardId: string, input: string): Promise<ActionResult> {
  return run(async () => points.redeem(await requireUser(), String(handle), String(rewardId), String(input ?? "")));
}

export async function resolveRedemptionAction(id: string, outcome: "fulfilled" | "refunded"): Promise<ActionResult> {
  return run(async () => points.resolveRedemption(await requireUser(), String(id), outcome === "refunded" ? "refunded" : "fulfilled"));
}

export async function updatePointsAction(input: { on: boolean; perUsd: number; when: string; rewards: unknown[] }): Promise<ActionResult> {
  return run(async () => points.updatePoints(await requireUser(), input));
}

export async function followAction(handle: string, on: boolean): Promise<ActionResult> {
  return run(async () => notifications.setFollow(await requireUser(), String(handle), on === true));
}

/** The bell's poll: unread count and the latest notices. */
export async function noticesAction(): Promise<{ unread: number; items: { id: string; at: number; kind: string; title: string; body: string; href: string; read: boolean }[] }> {
  const user = await currentUser();
  if (!user) return { unread: 0, items: [] };
  await notifications.checkFollowedLive(user).catch(() => undefined);
  return { unread: notifications.unreadCount(user), items: notifications.noticesFor(user, 25) };
}

export async function markNoticesReadAction(ids?: string[]): Promise<ActionResult> {
  return run(async () => notifications.markRead(await requireUser(), Array.isArray(ids) ? ids.map(String) : undefined));
}

export async function giveAction(handle: string, amountUsd: number, note: string): Promise<ActionResult> {
  return run(async () => gifts.give(await requireUser(), String(handle), Number(amountUsd), String(note ?? "")));
}

/** Email sign-in, step one: mail a code (or, on a dev server with no mail service, return it to show). */
export async function emailCodeAction(email: string): Promise<{ ok: true; shown?: string } | { ok: false; error: string }> {
  try {
    return { ok: true, ...(await sendCode(String(email))) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

/** Email sign-in, step two: check the code, sign in (making the account the first time), and say where to go. */
export async function emailVerifyAction(email: string, code: string, as?: string): Promise<{ ok: true; next: string } | { ok: false; error: string }> {
  try {
    const address = checkCode(String(email), String(code));
    const user = await service.signInWith("email", { subject: address, name: address.split("@")[0]!.replace(/[._+-]+/g, " ").trim(), email: address });
    await startSession(user.id);
    if (user.onboarded === false && as === "fan") await service.chooseRole(user, "fan");
    revalidatePath("/", "layout");
    if (user.onboarded === false) return { ok: true, next: as === "streamer" ? "/welcome?as=streamer" : "/welcome" };
    return { ok: true, next: user.role === "streamer" ? "/dashboard" : user.role === "mod" ? "/reviews" : "/" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

/**
 * The first-time fan path (/j/<handle>): check the code, sign in, and for a
 * new account make it a planter under the name they typed, which is the
 * name the stream will read out.
 */
export async function joinVerifyAction(email: string, code: string, name: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  try {
    const address = checkCode(String(email), String(code));
    let user = await service.signInWith("email", { subject: address, name: address.split("@")[0]!.replace(/[._+-]+/g, " ").trim(), email: address });
    if (user.onboarded === false) {
      user = await service.chooseRole(user, "fan");
      service.renameNewPlanter(user, String(name));
    }
    await startSession(user.id);
    revalidatePath("/", "layout");
    return { ok: true, name: user.name };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

export async function startCampaignAction(name: string, goalUsd: string): Promise<ActionResult> {
  return run(async () => service.startCampaign(await requireUser(), String(name), Number(goalUsd || 0)));
}

export async function endCampaignAction(campaignId: string): Promise<ActionResult> {
  return run(async () => service.endCampaign(await requireUser(), String(campaignId)));
}
