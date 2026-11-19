import { gunzipSync } from "node:zlib";
import { verifySignature } from "@potted/chain";

/**
 * Reads a QuickNode Stream delivery: unzips it if needed (Streams sign the
 * uncompressed JSON), checks its signature with that Stream's security
 * token, and parses it. Returns the payload, or the response to send back.
 */
export async function readDelivery(request: Request, secret: string): Promise<{ payload: unknown } | { response: Response }> {
  const raw = Buffer.from(await request.arrayBuffer());
  let body: string;
  try {
    body = (raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw).toString("utf8");
  } catch {
    return { response: Response.json({ error: "Unreadable body" }, { status: 400 }) };
  }
  const ok = verifySignature({
    secret,
    body,
    nonce: request.headers.get("x-qn-nonce") ?? "",
    timestamp: request.headers.get("x-qn-timestamp") ?? "",
    signature: request.headers.get("x-qn-signature") ?? "",
  });
  if (!ok) return { response: Response.json({ error: "Bad signature" }, { status: 401 }) };
  try {
    return { payload: JSON.parse(body) };
  } catch {
    return { response: Response.json({ error: "Body is not JSON" }, { status: 400 }) };
  }
}
