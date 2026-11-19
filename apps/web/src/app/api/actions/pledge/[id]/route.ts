import { PublicKey } from "@solana/web3.js";
import { formatUsd, toMicro } from "@potted/core";
import { actionCard, actionError, actionHeaders, actionJson, actionUrl, baseOf, solanaLedger } from "@/lib/blinks";
import * as service from "@/lib/service";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

function find(id: string) {
  try {
    return service.getChallenge(id);
  } catch {
    return undefined;
  }
}

/** The card: title, description and pledge buttons. */
export async function GET(request: Request, { params }: Context) {
  const challenge = find((await params).id);
  if (!challenge) return actionError("No such challenge", 404);
  return actionJson(actionCard(challenge, baseOf(request)));
}

/** A pledge from a wallet: checks it against the same rules as any pledge, then returns the transaction to sign. */
export async function POST(request: Request, { params }: Context) {
  const challenge = find((await params).id);
  if (!challenge) return actionError("No such challenge", 404);
  const chain = solanaLedger();
  if (!chain) return actionError("This Potted server runs a simulated ledger, so pledges from a wallet are off.");

  let account: string;
  try {
    const body = (await request.json()) as { account?: unknown };
    account = new PublicKey(String(body.account)).toBase58();
  } catch {
    return actionError("Send the wallet address as `account`");
  }
  const amountUsd = Number(new URL(request.url).searchParams.get("amount"));
  if (!(amountUsd > 0)) return actionError("Enter an amount");
  const problem = service.walletPledgeProblem(challenge, account, toMicro(amountUsd));
  if (problem) return actionError(problem);

  try {
    const { transaction, toppedUpMicro } = await chain.pledgeTransactionFor(challenge, account, toMicro(amountUsd));
    const top = toppedUpMicro > 0 ? ` Your wallet gets ${formatUsd(toppedUpMicro)} of test USDC from the devnet faucet in the same transaction.` : "";
    return actionJson({
      type: "transaction",
      transaction,
      message: `Pledging ${formatUsd(toMicro(amountUsd))} to "${challenge.title}". It waits in escrow and comes back if the challenge is missed.${top}`,
      links: { next: { type: "post", href: `${actionUrl(baseOf(request), challenge.id)}/confirm` } },
    });
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Could not build the pledge");
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: actionHeaders() });
}
