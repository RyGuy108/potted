import { createHmac, timingSafeEqual } from "node:crypto";
import { type EscrowEvent, decodeLogs } from "./events";

/**
 * Checks that a webhook really came from our QuickNode Stream: the
 * signature is HMAC-SHA256 over nonce + timestamp + body, keyed with the
 * Stream's security token, in hex.
 */
export function verifySignature(input: { secret: string; nonce: string; timestamp: string; body: string; signature: string }): boolean {
  if (!input.secret || !input.nonce || !input.timestamp || !input.signature) return false;
  const expected = createHmac("sha256", input.secret).update(input.nonce + input.timestamp + input.body).digest();
  const given = Buffer.from(input.signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** One escrow event, with where on chain it happened. */
export interface ChainEvent extends EscrowEvent {
  /** Unique per event: the transaction signature and the event's position in it. */
  key: string;
  signature: string;
  slot: number;
  /** Block time in ms, or 0 when the stream did not include one. */
  at: number;
}

interface TxLike {
  signature?: unknown;
  slot?: unknown;
  blockTime?: unknown;
  logs?: unknown;
  err?: unknown;
  transaction?: { signatures?: unknown };
  meta?: { logMessages?: unknown; err?: unknown };
}

/**
 * Pulls escrow events out of a Stream delivery. It accepts the compact
 * shape our filter emits (docs/quicknode.md) and raw transactions, as a
 * bare list or wrapped in { data: [...] }, since batches nest lists.
 */
export function parseDelivery(payload: unknown, programId: string): ChainEvent[] {
  const events: ChainEvent[] = [];
  const visit = (node: unknown, slot: number, blockTime: number): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item, slot, blockTime);
      return;
    }
    if (typeof node !== "object" || node === null) return;
    const tx = node as TxLike & { data?: unknown; transactions?: unknown };
    const here = { slot: Number(tx.slot ?? slot) || 0, blockTime: Number(tx.blockTime ?? blockTime) || 0 };
    const signature = typeof tx.signature === "string" ? tx.signature : Array.isArray(tx.transaction?.signatures) ? tx.transaction.signatures[0] : undefined;
    const logs = Array.isArray(tx.logs) ? tx.logs : Array.isArray(tx.meta?.logMessages) ? tx.meta.logMessages : undefined;
    if (typeof signature === "string" && logs) {
      // A failed transaction changed nothing, whatever it logged.
      if (tx.err || tx.meta?.err) return;
      decodeLogs(logs.filter((l): l is string => typeof l === "string"), programId).forEach((event, index) =>
        events.push({ ...event, key: `${signature}:${index}`, signature, slot: here.slot, at: here.blockTime * 1000 }),
      );
      return;
    }
    if (tx.data !== undefined) visit(tx.data, here.slot, here.blockTime);
    if (tx.transactions !== undefined) visit(tx.transactions, here.slot, here.blockTime);
  };
  visit(payload, 0, 0);
  return events;
}
