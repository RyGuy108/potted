import { NextResponse } from "next/server";
import { autopilotTick } from "@/lib/scout";
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
  // With autopilot on, an empty stage gets the scout's next pitch.
  await autopilotTick(streamer).catch(() => undefined);

  const since = Number(url.searchParams.get("since") ?? -1);
  const challenges = service
    .stageChallenges(streamer.id)
    .filter((c) => c.status === "open" || c.status === "locked")
    .map(({ id, title, status, totalMicro, goalMicro }) => ({ id, title, status, totalMicro, goalMicro }));

  const settings = service.settingsOf(streamer);
  const raised = settings.causeOn ? service.raisedFor(streamer, settings.causeName) : undefined;
  return NextResponse.json({
    cause: raised ? { name: settings.causeName, pct: settings.causePct, ...raised } : null,
    settings: {
      announcer: settings.announcer,
      position: settings.overlayPosition,
      cards: settings.overlayCards,
      qr: settings.overlayQr,
    },
    seq: service.latestSeq(),
    // A first poll (since < 0) only syncs the cursor, so old events never replay.
    events: since < 0 ? [] : service.eventsSince(streamer.handle, since).map(({ seq, type, message }) => ({ seq, type, message })),
    challenges,
  });
}
