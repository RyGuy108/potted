import { type ChainEvent, decodeLogs } from "@potted/chain";
import { type Connection, PublicKey } from "@solana/web3.js";
import { recordChainEvents } from "./chain";

/**
 * Fills the on-chain record from the program's past transactions, for the
 * time before the Stream was running (or while it was down). Reads them
 * through the RPC endpoint (a QuickNode endpoint in production), newest
 * first, and decodes each one the same way as a Stream delivery, so a
 * transaction already delivered is not stored twice.
 */
export async function backfillChain(connection: Connection, programId: string, maxTransactions = 500): Promise<{ scanned: number; stored: number }> {
  const program = new PublicKey(programId);
  const events: ChainEvent[] = [];
  let before: string | undefined;
  let scanned = 0;
  while (scanned < maxTransactions) {
    const page = await connection.getSignaturesForAddress(program, { before, limit: Math.min(1000, maxTransactions - scanned) }, "confirmed");
    if (page.length === 0) break;
    scanned += page.length;
    before = page[page.length - 1]!.signature;
    const ok = page.filter((s) => !s.err).map((s) => s.signature);
    for (let i = 0; i < ok.length; i += 50) {
      const chunk = ok.slice(i, i + 50);
      const txs = await connection.getTransactions(chunk, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      txs.forEach((tx, index) => {
        if (!tx || tx.meta?.err) return;
        const signature = chunk[index]!;
        decodeLogs(tx.meta?.logMessages ?? [], programId).forEach((event, n) =>
          events.push({ ...event, key: `${signature}:${n}`, signature, slot: tx.slot, at: (tx.blockTime ?? 0) * 1000 }),
        );
      });
    }
  }
  return { scanned, stored: recordChainEvents(events) };
}
