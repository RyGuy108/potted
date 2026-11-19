import { badgeInfo } from "@/lib/service";

export const dynamic = "force-dynamic";

const escape = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** A badge's picture: a gold medal with a sprout and the badge's name. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const badge = badgeInfo((await params).id);
  if (!badge) return new Response("Not found", { status: 404 });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="0.5" cy="0.4" r="0.7"><stop offset="0" stop-color="#1d1813"/><stop offset="1" stop-color="#0c0a08"/></radialGradient>
    <radialGradient id="medal" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#fff1c9"/><stop offset="0.55" stop-color="#e3b25c"/><stop offset="1" stop-color="#9a6a2c"/></radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <circle cx="256" cy="210" r="132" fill="url(#medal)" stroke="#e3b25c" stroke-width="6"/>
  <circle cx="256" cy="210" r="108" fill="none" stroke="#7a5320" stroke-opacity="0.45" stroke-width="3"/>
  <path d="M256 290 C 250 250, 262 225, 256 160" stroke="#2f7a52" stroke-width="10" fill="none" stroke-linecap="round"/>
  <path d="M256 215 q -46 -6 -60 -40 q 40 -2 60 40 z" fill="#3ecf8e"/>
  <path d="M256 185 q 44 -10 56 -44 q -40 0 -56 44 z" fill="#3ecf8e"/>
  <text x="256" y="404" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="40" font-weight="700" fill="#faf7f2">${escape(badge.name)}</text>
  <text x="256" y="446" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="18" letter-spacing="4" fill="#e6c9a3">POTTED · GARDEN BADGE</text>
</svg>`;
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*" } });
}
