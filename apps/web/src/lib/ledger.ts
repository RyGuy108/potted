import type { Challenge, Evidence } from "@potted/core";
import { db, newId } from "./store";

/**
 * Where money lives. The app only talks to this interface, so the same
 * flows run against the local simulation or the Solana escrow program.
 */
export interface Ledger {
  readonly kind: "sim" | "solana";
  /** Test funds for judge mode. */
  faucet(wallet: string, amountMicro: number): Promise<string>;
  balanceOf(wallet: string): Promise<number>;
  createChallenge(challenge: Challenge, streamerWallet: string): Promise<{ ref: string; tx: string }>;
  pledge(challenge: Challenge, fanWallet: string, amountMicro: number): Promise<string>;
  lock(challenge: Challenge): Promise<string>;
  /** Success pays the pot to the streamer. Failure only opens refunds. */
  settle(challenge: Challenge, success: boolean, evidence: Evidence | undefined, streamerWallet: string): Promise<string>;
  refund(challenge: Challenge, fanWallet: string, amountMicro: number): Promise<string>;
}

/**
 * Balances kept in the local store. It mirrors the escrow program's rules
 * (a vault per challenge, no overdrafts) but moves no real tokens. Its
 * transaction ids start with "sim-" and the UI labels them as simulated.
 */
class SimLedger implements Ledger {
  readonly kind = "sim" as const;

  private move(from: string | null, to: string, amountMicro: number): string {
    if (!Number.isInteger(amountMicro) || amountMicro <= 0) throw new Error("Invalid amount");
    const balances = db().balances;
    if (from) {
      const available = balances[from] ?? 0;
      if (available < amountMicro) throw new Error("Not enough balance");
      balances[from] = available - amountMicro;
    }
    balances[to] = (balances[to] ?? 0) + amountMicro;
    return newId("sim-tx");
  }

  private vault(challenge: Challenge): string {
    return `vault:${challenge.id}`;
  }

  async faucet(wallet: string, amountMicro: number) {
    return this.move(null, wallet, amountMicro);
  }

  async balanceOf(wallet: string) {
    return db().balances[wallet] ?? 0;
  }

  async createChallenge(challenge: Challenge) {
    return { ref: `sim:${challenge.id}`, tx: newId("sim-tx") };
  }

  async pledge(challenge: Challenge, fanWallet: string, amountMicro: number) {
    return this.move(fanWallet, this.vault(challenge), amountMicro);
  }

  async lock() {
    return newId("sim-tx");
  }

  async settle(challenge: Challenge, success: boolean, _evidence: Evidence | undefined, streamerWallet: string) {
    const pot = db().balances[this.vault(challenge)] ?? 0;
    if (success && pot > 0) return this.move(this.vault(challenge), streamerWallet, pot);
    return newId("sim-tx");
  }

  async refund(challenge: Challenge, fanWallet: string, amountMicro: number) {
    return this.move(this.vault(challenge), fanWallet, amountMicro);
  }
}

const sim = new SimLedger();

export function ledger(): Ledger {
  if ((process.env.POTTED_LEDGER ?? "sim") !== "sim") {
    // The Solana ledger lands once the escrow program is deployed and its
    // IDL is generated. Failing loudly beats silently simulating.
    throw new Error('POTTED_LEDGER="solana" is not wired up yet. Use "sim" for now.');
  }
  return sim;
}

export function isSimTx(tx: string | undefined): boolean {
  return !!tx && tx.startsWith("sim-");
}
