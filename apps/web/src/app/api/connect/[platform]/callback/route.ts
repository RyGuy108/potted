import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { connectYouTube } from "@/lib/chat-bot";
import { checkConnectState, connectKick } from "@/lib/kick";
import { currentUser } from "@/lib/session";
import { publicBase } from "@/lib/url";

export const dynamic = "force-dynamic";

/**
 * Kick or Google sends the climber back here. It only completes when the
 * state matches the cookie set by Connect and the same climber is signed in.
 */
export async function GET(request: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const base = await publicBase();
  const anchor = platform === "kick" ? "kick" : "chat-bot";
  const back = `${base}/dashboard/channel`;
  const url = new URL(request.url);
  const jar = await cookies();
  const cookie = jar.get("potted_connect")?.value;
  jar.delete({ name: "potted_connect", path: "/api/connect" });
  const user = await currentUser();
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error")) return NextResponse.redirect(`${back}?bot=declined#${anchor}`);
  const ok = user?.role === "streamer" ? checkConnectState(cookie, platform, url.searchParams.get("state"), user.id) : undefined;
  if (!user || !ok || !code) return NextResponse.redirect(`${back}?bot=failed#${anchor}`);
  try {
    const redirect = `${base}/api/connect/${platform}/callback`;
    if (platform === "kick") await connectKick(user, code, ok.verifier, redirect);
    else if (platform === "youtube") await connectYouTube(user, code, redirect);
    else throw new Error("Unknown platform");
    return NextResponse.redirect(`${back}?bot=${platform}#${anchor}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.warn("[chat-bot] connect", platform, message);
    const why = /another Potted account/.test(message) ? "taken" : "failed";
    return NextResponse.redirect(`${back}?bot=${why}#${anchor}`);
  }
}
