import { readDelivery } from "@/lib/quicknode-delivery";
import * as service from "@/lib/service";

export const dynamic = "force-dynamic";

/**
 * The charity Stream: USDC arriving at causes' wallets, from the escrow
 * program's share payments or from anyone else. A separate Stream with its
 * own security token; see docs/quicknode.md.
 */
export async function POST(request: Request) {
  const secret = process.env.QUICKNODE_CAUSES_SECRET;
  if (!secret) return Response.json({ error: "Set QUICKNODE_CAUSES_SECRET to accept the charity Stream" }, { status: 503 });
  const read = await readDelivery(request, secret);
  if ("response" in read) return read.response;
  return Response.json({ stored: service.recordCauseReceipts(causeEntries(read.payload)) });
}

/** The entries our charity filter sends, as a bare list or wrapped in { data }. */
function causeEntries(payload: unknown): { signature: string; wallet: string; amountMicro: number; slot: number; at: number }[] {
  const list = Array.isArray(payload) ? payload : Array.isArray((payload as { data?: unknown })?.data) ? (payload as { data: unknown[] }).data : [];
  return list.flatMap((item) => {
    const e = item as { signature?: unknown; wallet?: unknown; amount?: unknown; slot?: unknown; blockTime?: unknown };
    const amount = Number(e.amount);
    if (typeof e.signature !== "string" || typeof e.wallet !== "string" || !(amount > 0) || !Number.isSafeInteger(amount)) return [];
    return [{ signature: e.signature, wallet: e.wallet, amountMicro: amount, slot: Number(e.slot) || 0, at: (Number(e.blockTime) || 0) * 1000 }];
  });
}
