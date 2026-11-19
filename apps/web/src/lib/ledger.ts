import type { Challenge, Evidence } from "@potted/core";
import { SolanaLedger } from "./solana-ledger";
import { ensureTestAccounts } from "./test-accounts";
import { db, newId, save } from "./store";

/**
 * Where money lives. The app only talks to this interface, so the same
 * flows run against the local simulation or the Solana escrow program.
 */
export interface Ledger {
  readonly kind: "sim" | "solana";
  /** A wallet for a new account. */
  newWallet(userId: string): string;
  /** Test funds for judge mode. */
  faucet(wallet: string, amountMicro: number): Promise<string>;
  balanceOf(wallet: string): Promise<number>;
  /** Opens the challenge. `shareWallets` are the wallets for its splits, in order; the Solana ledger fixes them on chain. */
  createChallenge(challenge: Challenge, streamerWallet: string, shareWallets?: string[]): Promise<{ ref: string; tx: string }>;
  pledge(challenge: Challenge, fanWallet: string, amountMicro: number): Promise<string>;
  /** Closes pledging. Pays the up-front share out as listed, if there is one. */
  lock(challenge: Challenge, upfront: Payout[]): Promise<string>;
  /**
   * Success pays the pot out as listed; the amounts must add up to the
   * pot. Failure pays no one and only opens refunds.
   */
  settle(challenge: Challenge, success: boolean, evidence: Evidence | undefined, payouts: Payout[]): Promise<string>;
  refund(challenge: Challenge, fanWallet: string, amountMicro: number): Promise<string>;
  /** A plain transfer between two wallets, for a gift. No escrow, no conditions. */
  transfer(fromWallet: string, toWallet: string, amountMicro: number): Promise<string>;
  /**
   * Fan requests (bounties). Money is held per request until the climber
   * answers. It is paid to the climber when they start the attempt, and
   * returned to the planter if they pass, never start, or it expires.
   */
  holdBacking(bountyId: string, fanWallet: string, amountMicro: number): Promise<string>;
  returnBacking(bountyId: string, fanWallet: string, amountMicro: number): Promise<string>;
  payBacking(bountyId: string, climberWallet: string, amountMicro: number): Promise<string>;
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

  newWallet(userId: string): string {
    return `sim:${userId}`;
  }

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

  async transfer(fromWallet: string, toWallet: string, amountMicro: number) {
    return this.move(fromWallet, toWallet, amountMicro);
  }

  async pledge(challenge: Challenge, fanWallet: string, amountMicro: number) {
    return this.move(fanWallet, this.vault(challenge), amountMicro);
  }

  async lock(challenge: Challenge, upfront: Payout[]) {
    for (const p of upfront) if (p.amountMicro > 0) this.move(this.vault(challenge), p.wallet, p.amountMicro);
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

  async payBacking(bountyId: string, climberWallet: string, amountMicro: number) {
    return this.move(`bounty:${bountyId}`, climberWallet, amountMicro);
  }
}

const sim = new SimLedger();

let solana: SolanaLedger | undefined;

/**
 * The simulated ledger unless POTTED_LEDGER is "solana". A misconfigured
 * Solana ledger throws rather than quietly falling back to simulation.
 */
export function ledger(): Ledger {
  const mode = process.env.POTTED_LEDGER ?? "sim";
  if (mode === "sim") {
    ensureTestAccounts(sim);
    return sim;
  }
  if (mode !== "solana") throw new Error(`Unknown POTTED_LEDGER "${mode}". Use "sim" or "solana".`);
  if (!solana) {
    solana = new SolanaLedger();
    giveRealWallets(solana);
  }
  ensureTestAccounts(solana);
  return solana;
}

/**
 * Accounts made on the simulated ledger (the demo and sample ones) get a
 * real wallet. So does any account whose key this server no longer has,
 * since nothing can be signed for it; planters get their test money again.
 * Runs when the Solana ledger starts, and again after the sample adds its
 * accounts.
 */
export function giveRealWallets(ready: SolanaLedger | undefined = solana): number {
  if (!ready) return 0;
  let changed = 0;
  for (const user of db().users) {
    const lost = !user.wallet.startsWith("sim:") && !ready.hasKey(user.wallet);
    if (!user.wallet.startsWith("sim:") && !lost) continue;
    user.wallet = ready.newWallet();
    changed += 1;
    if (lost && user.role === "fan") {
      void ready.faucet(user.wallet, 25_000_000).catch((err) => console.error(`Could not refund test USDC to ${user.name}:`, err));
    }
  }
  if (changed > 0) save();
  return changed;
}

export function explorerTxUrl(tx: string): string {
  const cluster = process.env.SOLANA_CLUSTER || "devnet";
  return `https://explorer.solana.com/tx/${tx}${cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`}`;
}

export function isSimTx(tx: string | undefined): boolean {
  return !!tx && tx.startsWith("sim-");
}
