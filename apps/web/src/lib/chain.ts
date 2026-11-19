import type { ChainEvent } from "@potted/chain";
import { db, save } from "./store";

const KEEP = 500;

/** Stores events from the chain, once each. Streams redeliver on retries and reorgs. */
export function recordChainEvents(events: ChainEvent[]): number {
  const state = db();
  const seen = new Set(state.chain.map((e) => e.key));
  const fresh = events.filter((e) => !seen.has(e.key));
  if (fresh.length === 0) return 0;
  state.chain.push(...fresh);
  state.chain.sort((a, b) => a.slot - b.slot);
  if (state.chain.length > KEEP) state.chain.splice(0, state.chain.length - KEEP);
  save();
  return fresh.length;
}

/** Newest first. */
export function chainEvents(limit = 100): ChainEvent[] {
  return db().chain.slice(-limit).reverse();
}

export function explorerUrl(signature: string): string {
  const cluster = process.env.SOLANA_CLUSTER || "devnet";
  return `https://explorer.solana.com/tx/${signature}${cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`}`;
}
