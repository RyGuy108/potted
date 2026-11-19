import { pledgeCard } from "@/lib/share-cards";

export const dynamic = "force-dynamic";

/** One pledge's share card as a PNG, for previews and the download button. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const card = pledgeCard((await params).id);
  return card ?? new Response("Not found", { status: 404 });
}
