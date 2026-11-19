import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { youtubeAuthorizeUrl, youtubeConfigured } from "@/lib/chat-bot";
import { connectCookie, kickAuthorizeUrl, kickConfigured, pkce } from "@/lib/kick";
import { currentUser } from "@/lib/session";
import { publicBase } from "@/lib/url";

export const dynamic = "force-dynamic";

/**
 * Sends a climber to Kick or Google to let the !potted bot into their chat.
 * The state (and Kick's PKCE verifier) goes in a short-lived cookie bound to
 * the signed-in climber, so the callback only completes for them.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const base = await publicBase();
  const back = `${base}/dashboard/channel`;
  const user = await currentUser();
  if (user?.role !== "streamer") return NextResponse.redirect(`${base}/login`);
  const state = randomBytes(16).toString("hex");
  // Must match the callback registered with Kick or Google exactly.
  const redirect = `${base}/api/connect/${platform}/callback`;
  const jar = await cookies();
  const cookie = { httpOnly: true, secure: base.startsWith("https://"), sameSite: "lax" as const, path: "/api/connect", maxAge: 600 };
  if (platform === "kick" && kickConfigured()) {
    const { verifier, challenge } = pkce();
    jar.set("potted_connect", connectCookie("kick", state, verifier, user.id), cookie);
    return NextResponse.redirect(kickAuthorizeUrl(redirect, state, challenge));
  }
  if (platform === "youtube" && youtubeConfigured()) {
    jar.set("potted_connect", connectCookie("youtube", state, "", user.id), cookie);
    return NextResponse.redirect(youtubeAuthorizeUrl(redirect, state));
  }
  return NextResponse.redirect(`${back}?bot=not-set-up#${platform === "kick" ? "kick" : "chat-bot"}`);
}
