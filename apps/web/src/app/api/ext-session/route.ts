import { cookies } from "next/headers";
import { SESSION_COOKIE, extTokenFromSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Lets the browser extension sign itself in when the user is already signed
 * in on the website. The extension calls this with the site's session,
 * either sent by the browser as a cookie or read by the extension and sent
 * in the `X-Potted-Session` header, and gets back an extension token.
 *
 * There are deliberately no CORS headers here: other websites cannot read
 * the answer, and the session cookie is SameSite=Lax so they cannot send it
 * either. Only the extension, which has permission for this site, can.
 */
export async function GET(request: Request) {
  const fromHeader = request.headers.get("x-potted-session");
  const fromCookie = (await cookies()).get(SESSION_COOKIE)?.value;
  const found = extTokenFromSession(fromHeader) ?? extTokenFromSession(fromCookie);
  const headers = { "Cache-Control": "no-store" };
  if (!found) return Response.json({ error: "Not signed in on the site" }, { status: 401, headers });
  return Response.json({ token: found.token, user: { id: found.user.id, name: found.user.name, role: found.user.role } }, { headers });
}
