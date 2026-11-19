import { MAX_USD, formatUsd, toMicro } from "@potted/core";
import { ledger } from "./ledger";
import * as notifications from "./notifications";
import * as service from "./service";
import { type Gift, type User, db, newId, save } from "./store";

/**
 * Just give: a planter sends a climber money straight away, with no
 * challenge and nothing to complete. It is a plain transfer between their
 * wallets (on-chain on Solana), shows on the overlay, earns channel points
 * like a pledge, and cannot be refunded.
 */

const fail = (message: string): never => {
  throw new Error(message);
};

export const GIFT_MAX_USD = MAX_USD;

export async function give(actor: User, handle: string, amountUsd: number, note = ""): Promise<Gift> {
  if (actor.role !== "fan") fail("Sign in as a planter to give");
  const streamer = service.getStreamer(handle) ?? fail("Streamer not found");
  const amountMicro = toMicro(amountUsd);
  const settings = service.settingsOf(streamer);
  if (!(amountMicro >= toMicro(settings.minPledgeUsd))) fail(`The smallest gift on this stream is ${formatUsd(toMicro(settings.minPledgeUsd))}`);
  if (amountMicro > toMicro(GIFT_MAX_USD)) fail(`One gift can be up to $${GIFT_MAX_USD.toLocaleString("en-US")}`);
  const text = note.trim().replace(/\s+/g, " ");
  if (text.length > 140) fail("Keep the message under 140 characters");
  if (text && settings.blockedWords.some((word) => text.toLowerCase().includes(word))) fail("That message uses a word this streamer has blocked");
  if ((await service.balanceOf(actor)) < amountMicro) fail("Not enough test USDC for that gift");
  const tx = await ledger().transfer(actor.wallet, streamer.wallet, amountMicro);
  const gift: Gift = { id: newId("g"), fanId: actor.id, streamerId: streamer.id, amountMicro, note: text, at: Date.now(), tx };
  (db().gifts ??= []).push(gift);
  service.announceStream(streamer.handle!, "gift", `${actor.name} gave ${formatUsd(amountMicro)}${text ? `: "${text}"` : "."}`);
  notifications.notify(streamer.id, "gift", `${actor.name} gave you ${formatUsd(amountMicro)}`, text || "A gift, no challenge attached.", "/analytics");
  save();
  return gift;
}

export function giftsTo(streamerId: string, limit = 50): (Gift & { fanName: string })[] {
  return (db().gifts ?? [])
    .filter((g) => g.streamerId === streamerId)
    .slice(-limit)
    .reverse()
    .map((g) => ({ ...g, fanName: service.getUser(g.fanId)?.name ?? "A planter" }));
}

export function giftTotals(streamerId: string): { totalMicro: number; count: number; givers: number } {
  const list = (db().gifts ?? []).filter((g) => g.streamerId === streamerId);
  return { totalMicro: list.reduce((sum, g) => sum + g.amountMicro, 0), count: list.length, givers: new Set(list.map((g) => g.fanId)).size };
}

export function giftedBy(fanId: string, streamerId?: string): number {
  return (db().gifts ?? []).filter((g) => g.fanId === fanId && (!streamerId || g.streamerId === streamerId)).reduce((sum, g) => sum + g.amountMicro, 0);
}
