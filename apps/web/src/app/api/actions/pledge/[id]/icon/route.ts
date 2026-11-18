import { actionIcon } from "@/lib/blinks";
import * as service from "@/lib/service";

export const dynamic = "force-dynamic";

/** The Blink's square image, drawn from the challenge's current pot. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let challenge;
  try {
    challenge = service.getChallenge((await params).id);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  return new Response(actionIcon(challenge), {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=30", "Access-Control-Allow-Origin": "*" },
  });
}
