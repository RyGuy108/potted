import { baseOf } from "@/lib/blinks";
import { badgeInfo } from "@/lib/service";

export const dynamic = "force-dynamic";

/** A badge's public metadata, in the shape wallets and explorers read for a token's `uri`. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  if (id === "collection") {
    // The compressed badges' collection (see badge-cnft.ts).
    const base = baseOf(request);
    return Response.json(
      {
        name: "Potted Garden Badges",
        symbol: "POTTED",
        description: "Badges planters earn by backing streamers' challenges on Potted. Soulbound: they cannot be sold or moved.",
        image: `${base}/api/badges/first-bean/image`,
        external_url: `${base}/garden`,
      },
      { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" } },
    );
  }
  const badge = badgeInfo(id);
  if (!badge) return Response.json({ error: "No such badge" }, { status: 404 });
  const base = baseOf(request);
  return Response.json(
    {
      name: `Potted · ${badge.name}`,
      symbol: "POTTED",
      description: `${badge.how}. A Potted garden badge: earned by backing streamers' challenges, and soulbound, so it cannot be sold or moved.`,
      image: `${base}/api/badges/${badge.id}/image`,
      external_url: `${base}/garden`,
      attributes: [
        { trait_type: "Badge", value: badge.name },
        { trait_type: "Earned by", value: badge.how },
        { trait_type: "Transferable", value: "No" },
      ],
      properties: { category: "image", files: [{ uri: `${base}/api/badges/${badge.id}/image`, type: "image/svg+xml" }] },
    },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" } },
  );
}
