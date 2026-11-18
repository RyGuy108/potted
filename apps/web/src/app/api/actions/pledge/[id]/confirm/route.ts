import { formatUsd } from "@potted/core";
import { actionError, actionHeaders, actionJson, actionUrl, baseOf, solanaLedger } from "@/lib/blinks";
import * as service from "@/lib/service";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * The wallet calls this after the pledge confirms. The transaction is read
 * back from the chain, never trusted from the request, and booked once;
 * the QuickNode Stream may have booked it already.
 */
export async function POST(request: Request, { params }: Context) {
  const id = (await params).id;
  let challenge;
  try {
    challenge = service.getChallenge(id);
  } catch {
    return actionError("No such challenge", 404);
  }
  const chain = solanaLedger();
  if (!chain) return actionError("This Potted server runs a simulated ledger.");
  const body = (await request.json().catch(() => ({}))) as { signature?: unknown; account?: unknown };
  const signature = typeof body.signature === "string" ? body.signature : "";
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(signature)) return actionError("Send the transaction `signature`");

  const pledge = await chain.pledgeIn(signature, challenge).catch(() => undefined);
  if (!pledge) return actionError("That transaction is not a confirmed pledge to this challenge yet. Try again in a moment.");
  service.recordWalletPledge({ challengeAccount: service.chainAccountOf(challenge.ledgerRef ?? ""), signature, ...pledge, confirmedAt: Date.now() });

  const base = baseOf(request);
  const fresh = service.getChallenge(id);
  return actionJson({
    type: "completed",
    icon: `${actionUrl(base, id)}/icon`,
    title: "You're in the pot",
    label: "Pledged",
    description: `${formatUsd(pledge.amountMicro)} is in escrow for "${fresh.title}". The pot is at ${formatUsd(fresh.totalMicro)}. Watch it live at ${base}/c/${id}.`,
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: actionHeaders() });
}
