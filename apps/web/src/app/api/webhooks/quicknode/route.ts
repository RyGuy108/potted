import { gunzipSync } from "node:zlib";
import { parseDelivery, verifySignature } from "@potted/chain";
import { recordChainEvents } from "@/lib/chain";
import * as service from "@/lib/service";

export const dynamic = "force-dynamic";

/**
 * Receives the QuickNode Stream that watches the escrow program. Every
 * delivery must carry a valid signature; see docs/quicknode.md for setup.
 */
export async function POST(request: Request) {
  const secret = process.env.QUICKNODE_WEBHOOK_SECRET;
  const programId = process.env.POTTED_PROGRAM_ID;
  if (!secret || !programId) {
    return Response.json({ error: "Set QUICKNODE_WEBHOOK_SECRET and POTTED_PROGRAM_ID to accept stream deliveries" }, { status: 503 });
  }

  // Streams sign the uncompressed JSON, so unzip before checking.
  const raw = Buffer.from(await request.arrayBuffer());
  let body: string;
  try {
    body = (raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw).toString("utf8");
  } catch {
    return Response.json({ error: "Unreadable body" }, { status: 400 });
  }
  const ok = verifySignature({
    secret,
    body,
    nonce: request.headers.get("x-qn-nonce") ?? "",
    timestamp: request.headers.get("x-qn-timestamp") ?? "",
    signature: request.headers.get("x-qn-signature") ?? "",
  });
  if (!ok) return Response.json({ error: "Bad signature" }, { status: 401 });

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return Response.json({ error: "Body is not JSON" }, { status: 400 });
  }
  const arrived = Date.now();
  const events = parseDelivery(payload, programId);
  const stored = recordChainEvents(events);
  // Pledges: put the overlay line for a pledge made here on screen now, and
  // book a pledge someone signed with their own wallet (a Blink) if the
  // wallet's confirmation call has not already.
  let shown = 0;
  let booked = 0;
  for (const e of events) {
    if (e.name !== "Pledged") continue;
    shown += service.releaseChainEvents(e.signature, arrived);
    const fresh = service.recordWalletPledge({
      challengeAccount: e.challenge,
      wallet: String(e.fields.fan),
      amountMicro: Number(e.fields.amount),
      signature: e.signature,
      confirmedAt: e.at || arrived,
      streamAt: arrived,
    });
    if (fresh) booked++;
  }
  return Response.json({ decoded: events.length, stored, shown, booked });
}
