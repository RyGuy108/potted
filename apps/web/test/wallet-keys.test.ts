import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Keypair } from "@solana/web3.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SolanaLedger } from "../src/lib/solana-ledger";

let dir: string;
const saved = { ...process.env };

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "potted-keys-"));
  process.env.POTTED_DATA_DIR = dir;
  process.env.VERIFIER_SECRET_KEY = JSON.stringify([...Keypair.generate().secretKey]);
  process.env.USDC_MINT = Keypair.generate().publicKey.toBase58();
  process.env.POTTED_PROGRAM_ID = Keypair.generate().publicKey.toBase58();
});
afterEach(() => {
  process.env = { ...saved };
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("custodial wallet keys", () => {
  it("never loses a key when two processes add wallets", () => {
    // The dev server and the sample script each load the file, then each add a wallet.
    const server = new SolanaLedger();
    const script = new SolanaLedger();
    const a = server.newWallet();
    const b = script.newWallet();
    const c = server.newWallet(); // used to write over b
    const fresh = new SolanaLedger();
    for (const w of [a, b, c]) expect(fresh.hasKey(w)).toBe(true);
    // A process that loaded before b was added still finds it.
    expect(server.hasKey(b)).toBe(true);
    expect(fs.statSync(path.join(dir, "wallets.json")).mode & 0o777).toBe(0o600);
  });
});
