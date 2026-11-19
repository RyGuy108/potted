import { formatUsd } from "@potted/core";
import { ArtLayers } from "@/components/GameArt";
import { gameOf } from "@/lib/format";
import { compact, mockActivityOn, mockViewers } from "@/lib/mock-activity";
import { liveStreams } from "@/lib/service";
import { svgString } from "@/lib/svg-string";

/**
 * A live stream's card as an SVG image, for the browse carousels: the
 * game's illustration, the live badge, and what is riding on the stream.
 * The carousel slices images to bend them around its ring, so the card
 * has to be a picture rather than markup.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const listing = liveStreams().find((l) => l.streamer.handle === handle);
  if (!listing) return new Response("Not live", { status: 404 });
  const { streamer, headline } = listing;
  const W = 600;
  const H = 400;
  const font = "Geist, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
  const pot = `${formatUsd(listing.potMicro)} in the pot · ${listing.planters} ${listing.planters === 1 ? "planter" : "planters"}`;
  const watching = mockActivityOn() ? `${compact(mockViewers(streamer.handle ?? streamer.id))} watching` : "";
  const status = headline.status === "locked" ? "ATTEMPT IN PROGRESS" : "OPEN FOR PLEDGES";
  const svg = svgString(
    <svg xmlns="http://www.w3.org/2000/svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <defs>
        <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.45" stopColor="#0c0a08" stopOpacity="0" />
          <stop offset="1" stopColor="#0c0a08" stopOpacity="0.95" />
        </linearGradient>
      </defs>
      <svg x="0" y="0" width={W} height={H} viewBox="0 0 420 180" preserveAspectRatio="xMidYMid slice">
        <ArtLayers id={headline.gameId} />
      </svg>
      <rect width={W} height={H} fill="url(#shade)" />
      <rect x="22" y="22" width="70" height="34" rx="6" fill="#e5484d" />
      <text x="57" y="45" textAnchor="middle" fontFamily={font} fontSize="18" fontWeight="700" fill="#fff">
        LIVE
      </text>
      {watching && (
        <>
          <rect x={W - 22 - (watching.length * 10 + 24)} y="22" width={watching.length * 10 + 24} height="34" rx="6" fill="#0c0a08" fillOpacity="0.85" />
          <text x={W - 22 - 12} y="45" textAnchor="end" fontFamily={font} fontSize="17" fill="#faf7f2">
            {watching}
          </text>
        </>
      )}
      <circle cx="50" cy={H - 72} r="22" fill="#2a1f15" stroke="#b4875a" strokeWidth="2" />
      <text x="50" y={H - 65} textAnchor="middle" fontFamily={font} fontSize="20" fontWeight="700" fill="#e6c9a3">
        {streamer.name.charAt(0).toUpperCase()}
      </text>
      <text x="84" y={H - 76} fontFamily={font} fontSize="24" fontWeight="700" fill="#faf7f2">
        {streamer.name}
      </text>
      <text x="84" y={H - 50} fontFamily={font} fontSize="17" fill="#aaa298">
        {gameOf(headline).name}
      </text>
      <text x="28" y={H - 18} fontFamily={font} fontSize="17" fill="#faf7f2">
        {pot}
      </text>
      <text x={W - 28} y={H - 18} textAnchor="end" fontFamily={font} fontSize="13" letterSpacing="1.5" fill="#3ecf8e">
        {status}
      </text>
    </svg>,
  );
  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=30" },
  });
}
