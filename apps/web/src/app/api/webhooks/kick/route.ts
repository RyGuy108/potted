import { handleKickChat, verifyKickWebhook } from "@/lib/chat-bot";

export const dynamic = "force-dynamic";

/** Kick's webhooks: chat messages in channels whose climber connected Kick. Signed by Kick; anything else is refused. */
export async function POST(request: Request) {
  const body = await request.text();
  if (!(await verifyKickWebhook(request.headers, body))) return Response.json({ error: "Bad signature" }, { status: 401 });
  if (request.headers.get("kick-event-type") !== "chat.message.sent") return Response.json({ ignored: true });
  let event: Parameters<typeof handleKickChat>[1];
  try {
    event = JSON.parse(body);
  } catch {
    return Response.json({ error: "Body is not JSON" }, { status: 400 });
  }
  // Answer Kick at once; the reply goes out on its own.
  void handleKickChat(request.headers.get("kick-event-message-id") ?? "", event).catch((e) => console.warn("[chat-bot] kick reply:", e instanceof Error ? e.message : e));
  return Response.json({ ok: true });
}
