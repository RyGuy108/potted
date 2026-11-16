import { NextResponse } from "next/server";
import * as service from "@/lib/service";

export const dynamic = "force-dynamic";

/**
 * The overlay's feed: new events plus the live challenges. The overlay is
 * open for the whole stream, so each poll also nudges the verifier.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const streamer = service.getStreamer(url.searchParams.get("handle") ?? "");
  if (!streamer?.handle) return NextResponse.json({ error: "Unknown streamer" }, { status: 404 });

  await service.tick(streamer.id);

  const since = Number(url.searchParams.get("since") ?? -1);
  const challenges = service
    .listChallenges(streamer.id)
    .filter((c) => c.status === "open" || c.status === "locked")
    .map(({ id, title, status, totalMicro, goalMicro }) => ({ id, title, status, totalMicro, goalMicro }));

  return NextResponse.json({
    seq: service.latestSeq(),
    // A first poll (since < 0) only syncs the cursor, so old events never replay.
    events: since < 0 ? [] : service.eventsSince(streamer.handle, since).map(({ seq, type, message }) => ({ seq, type, message })),
    challenges,
  });
}
