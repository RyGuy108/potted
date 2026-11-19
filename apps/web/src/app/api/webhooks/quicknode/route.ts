import { parseDelivery } from "@potted/chain";
import { recordChainEvents } from "@/lib/chain";
import { baseOf } from "@/lib/blinks";
import { readDelivery } from "@/lib/quicknode-delivery";
import { postMoment } from "@/lib/x-posts";
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

  const read = await readDelivery(request, secret);
  if ("response" in read) return read.response;
  const payload = read.payload;

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
  // Grok posts on X about milestones and results the chain just showed. Not awaited: the Stream should not wait on Grok or X.
  const moments = stored > 0 ? service.momentsFrom(events, baseOf(request)) : [];
  for (const { challengeId, moment } of moments) void postMoment(challengeId, moment);
  return Response.json({ decoded: events.length, stored, shown, booked, ...(moments.length ? { moments: moments.length } : {}) });
}
