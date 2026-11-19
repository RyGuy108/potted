import { drainKickOutbox, receiveKickWebhook } from "@/lib/kick";

export const dynamic = "force-dynamic";

/**
 * Kick's webhooks for channels whose climber connected Kick. The raw body is
 * read before any parsing because the signature covers its exact bytes.
 * What to do is saved before Kick gets its answer; replies are sent after.
 */
export async function POST(request: Request) {
  const raw = Buffer.from(await request.arrayBuffer());
  const result = await receiveKickWebhook(request.headers, raw);
  if (result.queued) void drainKickOutbox().catch((e) => console.warn("[kick] outbox:", e instanceof Error ? e.message : e));
  return Response.json(result.body, { status: result.status });
}
