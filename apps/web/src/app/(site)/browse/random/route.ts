import { currentUser } from "@/lib/session";
import { surprisePick } from "@/lib/surprise";

/** Sends the visitor to a random live stream, one they haven't met yet when there is one. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = await currentUser();
  const handle = surprisePick(user ?? undefined, url.searchParams.get("skip") ?? undefined);
  const to = handle ? `/s/${handle}?from=surprise` : "/browse?surprise=none";
  return new Response(null, { status: 307, headers: { Location: to, "Cache-Control": "no-store" } });
}
