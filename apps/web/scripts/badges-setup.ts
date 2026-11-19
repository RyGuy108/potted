// One-time setup for compressed NFT badges (Metaplex Bubblegum v2): makes
// the frozen collection that keeps badges soulbound, and the Merkle tree
// that holds them (16,384 badges). The server key pays; on devnet that is
// well under 1 SOL. Run from apps/web:
//
//   pnpm badges:setup
//
// It prints the three lines to add to .env.local (and to the host's variables).
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { badgeUmi, setupBadgeTree } from "../src/lib/badge-cnft";

async function main() {
  const rpc = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const raw = process.env.VERIFIER_SECRET_KEY;
  if (!raw) {
    console.error("VERIFIER_SECRET_KEY is not set. Set up Solana first (docs/keys.md).");
    return process.exit(1);
  }
  const base = (process.env.POTTED_PUBLIC_URL || "").replace(/\/+$/, "");
  if (!base.startsWith("https://")) {
    console.error("Set POTTED_PUBLIC_URL to the site's public https address first: wallets read the badges' details from it.");
    return process.exit(1);
  }
  const server = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  const lamports = await new Connection(rpc, "confirmed").getBalance(server.publicKey);
  console.log(`Cluster:     ${rpc}`);
  console.log(`Server key:  ${server.publicKey.toBase58()} (${(lamports / LAMPORTS_PER_SOL).toFixed(3)} SOL)`);
  if (lamports < 0.5 * LAMPORTS_PER_SOL) {
    console.error("The server key needs about 0.5 SOL for the tree's rent. Fund it at https://faucet.solana.com, then run this again.");
    return process.exit(1);
  }
  const { tree, collection } = await setupBadgeTree(badgeUmi(rpc, server), `${base}/api/badges/collection`);
  console.log("\nDone. Add these lines to .env.local and to the host's variables:\n");
  console.log("POTTED_BADGES=compressed");
  console.log(`BADGE_TREE=${tree}`);
  console.log(`BADGE_COLLECTION=${collection}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
