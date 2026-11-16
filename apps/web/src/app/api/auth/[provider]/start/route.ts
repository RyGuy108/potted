import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authorizeUrl, isConfigured, isProvider } from "@/lib/oauth";
import { publicBase } from "@/lib/url";

export const dynamic = "force-dynamic";

/** Sends the browser to the provider's sign-in page. */
export async function GET(_request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const base = await publicBase();
  if (!isProvider(provider) || !isConfigured(provider)) return NextResponse.redirect(`${base}/login?error=not-set-up`);
  // The state value comes back on the callback; matching it to this cookie
  // proves the callback belongs to a sign-in this browser started.
  const state = randomBytes(16).toString("hex");
  (await cookies()).set("potted_oauth", `${provider}:${state}`, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return NextResponse.redirect(authorizeUrl(provider, `${base}/api/auth/${provider}/callback`, state));
}
