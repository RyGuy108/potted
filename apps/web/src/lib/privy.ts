import { db, save } from "./store";

/**
 * Wallets held by Privy. With PRIVY_APP_ID and PRIVY_APP_SECRET set (and the
 * Solana ledger on), each new account gets a Solana wallet made by Privy
 * instead of a key kept on this server. Privy holds the key in its secure
 * enclave; this server asks Privy to sign each transaction the account
 * makes, so the instructions sent to the escrow program are unchanged.
 */

export interface PrivyDeps {
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
}

const defaults = (): PrivyDeps => ({ fetch: globalThis.fetch, env: process.env });

export function privyConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.PRIVY_APP_ID && env.PRIVY_APP_SECRET);
}

async function call<T>(deps: PrivyDeps, path: string, body: unknown): Promise<T> {
  const id = deps.env.PRIVY_APP_ID!;
  const base = (deps.env.PRIVY_API_BASE || "https://api.privy.io").replace(/\/+$/, "");
  const res = await deps.fetch(`${base}/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${deps.env.PRIVY_APP_SECRET}`).toString("base64")}`,
      "privy-app-id": id,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Privy ${path.split("/")[0]} returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

/** The Privy wallet id behind an address, if Privy holds it. */
export function privyWalletId(address: string): string | undefined {
  return db().privyWallets?.[address];
}

/** Makes a Solana wallet in Privy and returns its address. */
export async function createPrivyWallet(deps: PrivyDeps = defaults()): Promise<string> {
  const wallet = await call<{ id: string; address: string }>(deps, "wallets", { chain_type: "solana" });
  if (!wallet.id || !wallet.address) throw new Error("Privy did not return a wallet");
  (db().privyWallets ??= {})[wallet.address] = wallet.id;
  save();
  return wallet.address;
}

/** Has Privy add the wallet's signature to a serialized transaction. Returns the signed transaction, base64. */
export async function privySign(address: string, transactionBase64: string, deps: PrivyDeps = defaults()): Promise<string> {
  const walletId = privyWalletId(address);
  if (!walletId) throw new Error(`Privy does not hold wallet ${address}`);
  const reply = await call<{ data?: { signed_transaction?: string; signedTransaction?: string } }>(deps, `wallets/${walletId}/rpc`, {
    method: "signTransaction",
    params: { transaction: transactionBase64, encoding: "base64" },
  });
  const signed = reply.data?.signed_transaction ?? reply.data?.signedTransaction;
  if (!signed) throw new Error("Privy did not return a signed transaction");
  return signed;
}
