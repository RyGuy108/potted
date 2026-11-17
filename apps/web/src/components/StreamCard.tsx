import { formatUsd } from "@potted/core";
import Link from "next/link";
import { gameOf } from "@/lib/format";
import type { StreamListing } from "@/lib/service";
import { GameArt } from "./GameArt";

/**
 * A stream in a directory, laid out the way stream sites list channels:
 * preview on top with a live badge and a count, then avatar, title,
 * name, game and tags. Where a stream site shows viewers, this shows
 * what is riding on the stream.
 */
export function StreamCard({ listing }: { listing: StreamListing }) {
  const { streamer, headline } = listing;
  const game = gameOf(headline);
  return (
    <Link href={`/s/${streamer.handle}`} className="stream-card">
      <div className="stream-thumb">
        <GameArt id={headline.gameId} name={game.name} />
        <span className="live-badge">LIVE</span>
        <span className="thumb-count">
          {formatUsd(listing.potMicro)} in the pot · {listing.planters} {listing.planters === 1 ? "planter" : "planters"}
        </span>
      </div>
      <div className="stream-info">
        <span className="avatar" aria-hidden="true">
          {streamer.name.charAt(0).toUpperCase()}
        </span>
        <div className="stream-text">
          <strong className="stream-title">{headline.title}</strong>
          <span className="stream-name">{streamer.name}</span>
          <span className="stream-game">{game.name}</span>
          <span className="stream-tags">
            <span className="pill-tag">{headline.status === "locked" ? "Attempt in progress" : "Open for pledges"}</span>
            {listing.liveCount > 1 && <span className="pill-tag">{listing.liveCount} challenges</span>}
            {listing.charity && <span className="pill-tag">Charity</span>}
            {listing.collab && <span className="pill-tag">Collab</span>}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function StreamGrid({ listings, empty }: { listings: StreamListing[]; empty: string }) {
  if (listings.length === 0) return <p className="empty">{empty}</p>;
  return (
    <div className="stream-grid">
      {listings.map((listing) => (
        <StreamCard key={listing.streamer.id} listing={listing} />
      ))}
    </div>
  );
}
