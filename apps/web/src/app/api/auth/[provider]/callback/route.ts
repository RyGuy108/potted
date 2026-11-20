import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { fetchProfile, isProvider } from "@/lib/oauth";
import { chooseRole, signInWith } from "@/lib/service";
import { startSession } from "@/lib/session";
import { publicBase } from "@/lib/url";

export const dynamic = "force-dynamic";

/** The provider sends the browser back here with a one-time code. */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const base = await publicBase();
  const url = new URL(request.url);
  const jar = await cookies();
  const [savedProvider, savedState, intent] = (jar.get("potted_oauth")?.value ?? "").split(":");
  jar.delete("potted_oauth");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!isProvider(provider) || !code || !state || savedProvider !== provider || savedState !== state) {
    return NextResponse.redirect(`${base}/login?error=${url.searchParams.get("error") === "access_denied" ? "cancelled" : "failed"}`);
  }
  try {
    const profile = await fetchProfile(provider, code, `${base}/api/auth/${provider}/callback`, { fetch: globalThis.fetch, env: process.env });
    const user = await signInWith(provider, profile);
    await startSession(user.id);
    if (user.onboarded === false && intent === "fan") await chooseRole(user, "fan");
    if (user.onboarded === false) return NextResponse.redirect(`${base}/welcome${intent === "streamer" || intent === "mod" ? `?as=${intent}` : ""}`);
    return NextResponse.redirect(`${base}/`);
  } catch {
    return NextResponse.redirect(`${base}/login?error=failed`);
  }
}
