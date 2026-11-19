/**
 * QuickNode helpers.
 *
 *   pnpm --filter @potted/web quicknode filters    Prints both Stream filters, ready to paste
 *   pnpm --filter @potted/web quicknode backfill   Fills the on-chain record from past transactions
 *
 * Reads POTTED_PROGRAM_ID, USDC_MINT and SOLANA_RPC_URL from .env.local, and
 * the causes' wallets from the app's data.
 */
import { causeFilterSource, escrowFilterSource } from "@potted/chain";
import { Connection } from "@solana/web3.js";
import { backfillChain } from "../src/lib/backfill";
import { allCauseWallets } from "../src/lib/service";
import { flush, hydrate } from "../src/lib/store";

const command = process.argv[2];
await hydrate();
const programId = process.env.POTTED_PROGRAM_ID;
if (!programId) {
  console.error("Set POTTED_PROGRAM_ID first (see docs/keys.md).");
  process.exit(1);
}

if (command === "filters") {
  console.log("// ===== Stream 1: escrow events (destination /api/webhooks/quicknode) =====\n");
  console.log(escrowFilterSource(programId));
  const mint = process.env.USDC_MINT;
  const causes = allCauseWallets();
  if (!mint) console.log("// Stream 2 needs USDC_MINT.");
  else {
    console.log(`// ===== Stream 2: charity wallets (destination /api/webhooks/quicknode/causes), ${causes.length} wallet(s) =====`);
    console.log("// Run this again and update the Stream when a streamer adds a cause.\n");
    console.log(causeFilterSource(mint, causes));
  }
} else if (command === "backfill") {
  const rpc = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  const result = await backfillChain(new Connection(rpc, "confirmed"), programId, Number(process.argv[3]) || 500);
  await flush();
  console.log(`Scanned ${result.scanned} transactions; stored ${result.stored} new events.`);
} else {
  console.error("Use: quicknode filters | quicknode backfill [max transactions]");
  process.exit(1);
}
