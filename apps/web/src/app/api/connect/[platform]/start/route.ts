import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { kickAuthorizeUrl, kickConfigured, pkce, youtubeAuthorizeUrl, youtubeConfigured } from "@/lib/chat-bot";
import { currentUser } from "@/lib/session";
import { publicBase } from "@/lib/url";

export const dynamic = "force-dynamic";

/** Sends a climber to Kick or Google to let the !potted bot into their chat. */
export async function GET(_request: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const base = await publicBase();
  const back = `${base}/dashboard/channel#chat-bot`;
  const user = await currentUser();
  if (user?.role !== "streamer") return NextResponse.redirect(`${base}/login`);
  const state = randomBytes(16).toString("hex");
  const redirect = `${base}/api/connect/${platform}/callback`;
  const jar = await cookies();
  if (platform === "kick" && kickConfigured()) {
    const { verifier, challenge } = pkce();
    jar.set("potted_connect", `kick:${state}:${verifier}`, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
    return NextResponse.redirect(kickAuthorizeUrl(redirect, state, challenge));
  }
  if (platform === "youtube" && youtubeConfigured()) {
    jar.set("potted_connect", `youtube:${state}:`, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
    return NextResponse.redirect(youtubeAuthorizeUrl(redirect, state));
  }
  return NextResponse.redirect(`${back}?bot=not-set-up`);
}
