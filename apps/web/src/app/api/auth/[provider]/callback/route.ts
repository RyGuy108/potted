import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { fetchProfile, isProvider } from "@/lib/oauth";
import { chooseRole, signInWith } from "@/lib/service";
import { linkIdentity } from "@/lib/account";
import { syncTwitchAccount } from "@/lib/account-sync";
import { currentUser, startSession } from "@/lib/session";
import { publicBase } from "@/lib/url";

export const dynamic = "force-dynamic";

/** The provider sends the browser back here with a one-time code. */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const base = await publicBase();
  const url = new URL(request.url);
  const jar = await cookies();
  const [savedProvider, savedState, intent, savedUser] = (jar.get("potted_oauth")?.value ?? "").split(":");
  jar.delete("potted_oauth");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!isProvider(provider) || !code || !state || savedProvider !== provider || savedState !== state) {
    return NextResponse.redirect(`${base}/login?error=${url.searchParams.get("error") === "access_denied" ? "cancelled" : "failed"}`);
  }
  try {
    const actor = intent === "link" ? await currentUser() : undefined;
    if (intent === "link" && (!actor || actor.id !== savedUser)) return NextResponse.redirect(`${base}/settings?error=connection-session`);
    const profile = await fetchProfile(provider, code, `${base}/api/auth/${provider}/callback`, { fetch: globalThis.fetch, env: process.env });
    if (actor) {
      linkIdentity(actor, provider, profile);
      let incomplete = false;
      if (provider === "twitch") await syncTwitchAccount(actor).catch(() => { incomplete = true; });
      return NextResponse.redirect(`${base}/settings?connected=${provider}${incomplete ? "&sync=pending" : ""}`);
    }
    const user = await signInWith(provider, profile);
    if (provider === "twitch") await syncTwitchAccount(user).catch(() => undefined);
    await startSession(user.id);
    if (user.onboarded === false && intent === "fan") await chooseRole(user, "fan");
    if (user.onboarded === false) return NextResponse.redirect(`${base}/welcome${intent === "streamer" || intent === "mod" ? `?as=${intent}` : ""}`);
    return NextResponse.redirect(`${base}/`);
  } catch {
    return NextResponse.redirect(intent === "link" ? `${base}/settings?error=connection` : `${base}/login?error=failed`);
  }
}
