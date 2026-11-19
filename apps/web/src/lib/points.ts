import { giftedBy } from "./gifts";
import * as notifications from "./notifications";
import * as service from "./service";
import { type PointsConfig, type Redemption, type Reward, type User, db, newId, save } from "./store";

/**
 * Channel points. Planters earn a climber's points by putting money into
 * that climber's pots, at a rate the climber sets, and spend them on
 * rewards the climber defines: a shoutout, picking the next game, playing
 * together. Redemptions land in the climber's queue to fulfil or refund,
 * and the overlay announces them.
 *
 * Points are worked out from pledges every time, never stored as a balance:
 * earned (from pledges) minus spent (redemptions not refunded). A refunded
 * pledge stops earning, so refunds can't be farmed for points.
 */

const fail = (message: string): never => {
  throw new Error(message);
};

export const STARTER_REWARDS: Omit<Reward, "id">[] = [
  { title: "Shoutout on stream", cost: 300, note: "Your name read out on stream with a thank-you.", needsInput: false, enabled: true },
  { title: "Pick the next challenge", cost: 800, note: "Name the next challenge; it goes to the top of the idea list.", needsInput: true, enabled: true },
  { title: "Choose the next game", cost: 1500, note: "Tell me what to play next stream.", needsInput: true, enabled: true },
  { title: "Play a match with me", cost: 3000, note: "Join a lobby with me on stream.", needsInput: true, enabled: true },
];

export const MAX_REWARDS = 12;

export function pointsConfig(streamerId: string): PointsConfig {
  const saved = db().points?.[streamerId];
  if (saved) return saved;
  return { on: true, perUsd: 100, when: "pledged", rewards: STARTER_REWARDS.map((r, i) => ({ ...r, id: `starter-${i}` })) };
}

/** Points a planter has from one climber: earned, spent and what is left. */
export function pointsOf(fan: User, streamerId: string): { earned: number; spent: number; balance: number } {
  const config = pointsConfig(streamerId);
  const state = db();
  const theirs = new Map(state.challenges.filter((c) => c.streamerId === streamerId).map((c) => [c.id, c]));
  let micro = 0;
  for (const p of state.pledges) {
    const c = theirs.get(p.challengeId);
    if (!c || p.userId !== fan.id) continue;
    if (config.when === "completed" && c.status !== "paid") continue;
    // A refund takes back what came back; an up-front share kept on a refund still counts.
    micro += p.amountMicro - service.returnedOf(p);
  }
  // A gift counts like a pledge that can never be refunded.
  micro += giftedBy(fan.id, streamerId);
  const earned = Math.floor((micro / 1_000_000) * config.perUsd);
  const spent = (state.redemptions ?? []).filter((r) => r.streamerId === streamerId && r.userId === fan.id && r.status !== "refunded").reduce((sum, r) => sum + r.cost, 0);
  return { earned, spent, balance: Math.max(0, earned - spent) };
}

/** Every climber a planter has points with, most first. */
export function allPointsOf(fan: User): { streamer: User; balance: number; earned: number }[] {
  const ids = new Set([
    ...db().pledges.filter((p) => p.userId === fan.id).map((p) => service.getChallenge(p.challengeId).streamerId),
    ...(db().gifts ?? []).filter((g) => g.fanId === fan.id).map((g) => g.streamerId),
  ]);
  return [...ids]
    .flatMap((id) => {
      const streamer = service.getUser(id);
      if (!streamer?.handle || !pointsConfig(id).on) return [];
      const { balance, earned } = pointsOf(fan, id);
      return earned > 0 ? [{ streamer, balance, earned }] : [];
    })
    .sort((a, b) => b.balance - a.balance);
}

export async function redeem(actor: User, handle: string, rewardId: string, input = ""): Promise<Redemption> {
  if (actor.role !== "fan") fail("Sign in as a planter to redeem points");
  const streamer = service.getStreamer(handle) ?? fail("Streamer not found");
  const config = pointsConfig(streamer.id);
  if (!config.on) fail(`${streamer.name} has turned channel points off`);
  const reward = config.rewards.find((r) => r.id === rewardId && r.enabled) ?? fail("That reward is not available");
  const { balance } = pointsOf(actor, streamer.id);
  if (balance < reward.cost) fail(`You need ${reward.cost - balance} more points for this`);
  const text = input.trim().replace(/\s+/g, " ");
  if (reward.needsInput && text.length < 2) fail("This reward needs a line from you");
  if (text.length > 140) fail("Keep it under 140 characters");
  const blocked = service.settingsOf(streamer).blockedWords;
  if (text && blocked.some((word) => text.toLowerCase().includes(word))) fail("That uses a word this streamer has blocked");
  const redemption: Redemption = {
    id: newId("rd"),
    streamerId: streamer.id,
    userId: actor.id,
    rewardId: reward.id,
    title: reward.title,
    cost: reward.cost,
    input: reward.needsInput ? text : "",
    at: Date.now(),
    status: "pending",
  };
  (db().redemptions ??= []).push(redemption);
  notifications.onRedeemed(redemption, actor.name);
  service.announceStream(streamer.handle!, "redeemed", `${actor.name} redeemed ${reward.title}${redemption.input ? `: "${redemption.input}"` : ""}.`);
  save();
  return redemption;
}

export function redemptionsFor(streamerId: string, limit = 30): (Redemption & { fanName: string })[] {
  return (db().redemptions ?? [])
    .filter((r) => r.streamerId === streamerId)
    .sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1) || b.at - a.at)
    .slice(0, limit)
    .map((r) => ({ ...r, fanName: service.getUser(r.userId)?.name ?? "A planter" }));
}

export async function resolveRedemption(actor: User, id: string, outcome: "fulfilled" | "refunded"): Promise<Redemption> {
  const redemption = (db().redemptions ?? []).find((r) => r.id === id) ?? fail("Redemption not found");
  if (redemption.streamerId !== actor.id) fail("Only this redemption's climber can answer it");
  if (redemption.status !== "pending") fail("That redemption is already answered");
  redemption.status = outcome;
  redemption.resolvedAt = Date.now();
  notifications.onRedemptionAnswered(redemption, actor.name, actor.handle ?? "");
  save();
  return redemption;
}

/** The climber's points setup. Rewards are checked one by one; ids are kept so redemptions stay linked. */
export async function updatePoints(actor: User, input: { on: unknown; perUsd: unknown; when: unknown; rewards: unknown }): Promise<PointsConfig> {
  if (actor.role !== "streamer") fail("Only a climber sets up channel points");
  const perUsd = Number(input.perUsd);
  if (!(Number.isInteger(perUsd) && perUsd >= 1 && perUsd <= 10_000)) fail("Points per dollar must be a whole number from 1 to 10,000");
  const when = input.when === "completed" ? "completed" : "pledged";
  const list = Array.isArray(input.rewards) ? input.rewards : [];
  if (list.length > MAX_REWARDS) fail(`Up to ${MAX_REWARDS} rewards`);
  const seen = new Set<string>();
  const rewards: Reward[] = list.map((raw, i) => {
    const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    const title = String(r.title ?? "").trim().replace(/\s+/g, " ");
    const note = String(r.note ?? "").trim().replace(/\s+/g, " ");
    const cost = Number(r.cost);
    if (title.length < 2 || title.length > 60) fail(`Reward ${i + 1}: name it in 2 to 60 characters`);
    if (note.length > 140) fail(`Reward ${i + 1}: keep the description under 140 characters`);
    if (!(Number.isInteger(cost) && cost >= 1 && cost <= 1_000_000)) fail(`Reward ${i + 1}: cost must be a whole number of points`);
    let id = typeof r.id === "string" && /^[a-z0-9_-]{1,40}$/i.test(r.id) ? r.id : newId("rw");
    if (seen.has(id)) id = newId("rw");
    seen.add(id);
    return { id, title, note, cost, needsInput: r.needsInput === true, enabled: r.enabled !== false };
  });
  const config: PointsConfig = { on: input.on === true, perUsd, when, rewards };
  (db().points ??= {})[actor.id] = config;
  save();
  return config;
}
