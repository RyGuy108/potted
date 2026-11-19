import { MAX_USD } from "@potted/core";
import { db, save } from "./store";

/**
 * Limits on Solana Action (Blink) pledges. Each one makes the server pay a
 * fee and rent, and may top the wallet up with test USDC, so anyone with a
 * script could drain the server's SOL. Checked before a transaction is
 * built:
 *
 * - each wallet: POTTED_BLINK_PER_WALLET per hour (default 10)
 * - each network address: POTTED_BLINK_PER_IP per hour (default 30), so one person cannot use many fresh wallets
 * - everyone together: POTTED_BLINK_PER_HOUR per hour (default 300)
 * - test USDC top-ups: POTTED_BLINK_TOPUP_USD per wallet, ever (default 500)
 */

const HOUR = 60 * 60_000;
const num = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const g = globalThis as { __pottedBlinkLog?: { wallets: Map<string, number[]>; ips: Map<string, number[]>; all: number[] } };
const log = (g.__pottedBlinkLog ??= { wallets: new Map(), ips: new Map(), all: [] });

function recent(list: number[], now: number): number[] {
  while (list.length && now - list[0]! > HOUR) list.shift();
  return list;
}

/** The address a request came from, as the host's proxy reports it. */
export function clientAddress(request: Request): string {
  return (request.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || request.headers.get("x-real-ip") || "unknown";
}

/** Why this Blink pledge is refused right now, or undefined. Counts it when allowed. */
export function takeBlinkSlot(wallet: string, ip: string, now = Date.now()): string | undefined {
  const w = recent(log.wallets.get(wallet) ?? [], now);
  const i = recent(log.ips.get(ip) ?? [], now);
  const all = recent(log.all, now);
  if (all.length >= num("POTTED_BLINK_PER_HOUR", 300)) return "Potted is taking a lot of pledges from X right now. Try again in a few minutes, or pledge on the site.";
  if (w.length >= num("POTTED_BLINK_PER_WALLET", 10)) return "This wallet has pledged a lot in the last hour. Try again later.";
  if (i.length >= num("POTTED_BLINK_PER_IP", 30)) return "Too many pledges from this network in the last hour. Try again later.";
  w.push(now);
  i.push(now);
  all.push(now);
  log.wallets.set(wallet, w);
  log.ips.set(ip, i);
  return undefined;
}

/** How much more test USDC the faucet may give this wallet, in micro-USDC. */
export function topUpLeft(wallet: string): number {
  const given = db().blinkTopUps?.[wallet] ?? 0;
  return Math.max(0, num("POTTED_BLINK_TOPUP_USD", MAX_USD) * 1_000_000 - given);
}

export function recordTopUp(wallet: string, amountMicro: number): void {
  if (amountMicro <= 0) return;
  const state = db();
  state.blinkTopUps ??= {};
  state.blinkTopUps[wallet] = (state.blinkTopUps[wallet] ?? 0) + amountMicro;
  save();
}

export function resetBlinkLimitsForTests(): void {
  log.wallets.clear();
  log.ips.clear();
  log.all.length = 0;
}
