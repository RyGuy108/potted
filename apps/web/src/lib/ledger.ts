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
  /**
   * Success pays the pot out as listed; the amounts must add up to the
   * pot. Failure pays no one and only opens refunds.
   */
  settle(challenge: Challenge, success: boolean, evidence: Evidence | undefined, payouts: Payout[]): Promise<string>;
  refund(challenge: Challenge, fanWallet: string, amountMicro: number): Promise<string>;
  /**
   * Bounties. Money is held per bounty until the streamer accepts or it
   * closes. Accepting moves each backing into the new challenge's vault as
   * a pledge from that backer; closing returns it to the backer.
   */
  holdBacking(bountyId: string, fanWallet: string, amountMicro: number): Promise<string>;
  returnBacking(bountyId: string, fanWallet: string, amountMicro: number): Promise<string>;
  backingToPledge(bountyId: string, challenge: Challenge, amountMicro: number): Promise<string>;
}

export interface Payout {
  wallet: string;
  amountMicro: number;
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

  async settle(challenge: Challenge, success: boolean, _evidence: Evidence | undefined, payouts: Payout[]) {
    if (!success) return newId("sim-tx");
    const pot = db().balances[this.vault(challenge)] ?? 0;
    const due = payouts.filter((p) => p.amountMicro > 0);
    if (due.reduce((sum, p) => sum + p.amountMicro, 0) !== pot) throw new Error("Payouts do not add up to the pot");
    for (const p of due) this.move(this.vault(challenge), p.wallet, p.amountMicro);
    return newId("sim-tx");
  }

  async refund(challenge: Challenge, fanWallet: string, amountMicro: number) {
    return this.move(this.vault(challenge), fanWallet, amountMicro);
  }

  async holdBacking(bountyId: string, fanWallet: string, amountMicro: number) {
    return this.move(fanWallet, `bounty:${bountyId}`, amountMicro);
  }

  async returnBacking(bountyId: string, fanWallet: string, amountMicro: number) {
    return this.move(`bounty:${bountyId}`, fanWallet, amountMicro);
  }

  async backingToPledge(bountyId: string, challenge: Challenge, amountMicro: number) {
    return this.move(`bounty:${bountyId}`, this.vault(challenge), amountMicro);
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
