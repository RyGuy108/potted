import { notFound } from "next/navigation";
import { Overlay } from "@/components/Overlay";
import { getStreamer } from "@/lib/service";

/**
 * The stream overlay. Add this URL to OBS as a browser source; the page
 * background is transparent. Append ?muted=1 to turn the announcer off.
 */
export default async function OverlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ muted?: string; bg?: string }>;
}) {
  const { handle } = await params;
  const { muted, bg } = await searchParams;
  const streamer = getStreamer(handle);
  if (!streamer?.handle) notFound();
  return (
    <div className={bg === "1" ? "overlay-page overlay-preview" : "overlay-page"}>
      <Overlay handle={streamer.handle} muted={muted === "1"} />
    </div>
  );
}
