// Prepares a cluster for Potted's Solana mode: checks the server key's
// SOL, and creates a test USDC mint that the server key controls, so the
// faucet can hand out test money. Run from apps/web:
//
//   pnpm solana:setup            # reads .env.local
//   pnpm solana:setup --airdrop  # also asks the cluster for 2 SOL
//
// It prints the USDC_MINT line to put in .env.local.
import { createMint } from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";

const rpc = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const raw = process.env.VERIFIER_SECRET_KEY;
if (!raw) {
  console.error("VERIFIER_SECRET_KEY is not set. Make one with `solana-keygen new -o verifier.json` and paste the file's contents into .env.local.");
  process.exit(1);
}
const server = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
const connection = new Connection(rpc, "confirmed");

console.log(`Cluster:     ${rpc}`);
console.log(`Server key:  ${server.publicKey.toBase58()}`);
if (process.argv.includes("--airdrop")) {
  try {
    const sig = await connection.requestAirdrop(server.publicKey, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    console.log("Airdropped 2 SOL.");
  } catch (error) {
    console.log(`Airdrop refused (${error.message}). Use https://faucet.solana.com instead.`);
  }
}
const lamports = await connection.getBalance(server.publicKey);
console.log(`SOL balance: ${(lamports / LAMPORTS_PER_SOL).toFixed(3)}`);
if (lamports < 0.05 * LAMPORTS_PER_SOL) {
  console.error("The server key needs SOL to pay fees. Fund it, then run this again.");
  process.exit(1);
}
const mint = await createMint(connection, server, server.publicKey, null, 6);
console.log("\nCreated a test USDC mint (6 decimals). Add this line to .env.local:\n");
console.log(`USDC_MINT=${mint.toBase58()}`);
