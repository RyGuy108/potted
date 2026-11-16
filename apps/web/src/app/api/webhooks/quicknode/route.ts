import { gunzipSync } from "node:zlib";
import { parseDelivery, verifySignature } from "@potted/chain";
import { recordChainEvents } from "@/lib/chain";

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
  const events = parseDelivery(payload, programId);
  return Response.json({ decoded: events.length, stored: recordChainEvents(events) });
}
