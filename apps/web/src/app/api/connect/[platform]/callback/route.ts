import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { connectKick, connectYouTube } from "@/lib/chat-bot";
import { currentUser } from "@/lib/session";
import { publicBase } from "@/lib/url";

export const dynamic = "force-dynamic";

/** Kick or Google sends the climber back here; the state and (for Kick) the PKCE verifier come from the cookie. */
export async function GET(request: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const base = await publicBase();
  const back = `${base}/dashboard/channel`;
  const url = new URL(request.url);
  const jar = await cookies();
  const [saved, state, verifier] = (jar.get("potted_connect")?.value ?? "").split(":");
  jar.delete("potted_connect");
  const user = await currentUser();
  const code = url.searchParams.get("code");
  if (user?.role !== "streamer" || !code || saved !== platform || state !== url.searchParams.get("state")) {
    return NextResponse.redirect(`${back}?bot=failed#chat-bot`);
  }
  try {
    const redirect = `${base}/api/connect/${platform}/callback`;
    if (platform === "kick") await connectKick(user, code, verifier ?? "", redirect);
    else if (platform === "youtube") await connectYouTube(user, code, redirect);
    else throw new Error("Unknown platform");
    return NextResponse.redirect(`${back}?bot=${platform}#chat-bot`);
  } catch (error) {
    console.warn("[chat-bot] connect", platform, error instanceof Error ? error.message : error);
    return NextResponse.redirect(`${back}?bot=failed#chat-bot`);
  }
}
