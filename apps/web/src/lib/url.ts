import { headers } from "next/headers";

/**
 * The address fans should be sent to. Set POTTED_PUBLIC_URL when the app is
 * behind a proxy or tunnel; otherwise it is read from the request.
 */
export async function publicBase(): Promise<string> {
  const fixed = process.env.POTTED_PUBLIC_URL?.replace(/\/+$/, "");
  if (fixed) return fixed;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
