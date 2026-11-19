import { streamerCard } from "@/lib/share-cards";

export const dynamic = "force-dynamic";

/** A climber's share card as a PNG. */
export async function GET(_req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const card = streamerCard((await params).handle);
  return card ?? new Response("Not found", { status: 404 });
}
