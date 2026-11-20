import { Avatar } from "./StreamHeader";
import { formatUsd } from "@potted/core";
import Link from "next/link";
import { gameOf } from "@/lib/format";
import type { StreamListing } from "@/lib/service";
import { compact, mockActivityOn, mockViewers } from "@/lib/mock-activity";
import { GameArt } from "./GameArt";
import { type CarouselStream, LiveCarousel } from "./LiveCarousel";

/**
 * A stream in a directory, laid out the way stream sites list channels:
 * preview on top with a live badge and a count, then avatar, title,
 * name, game and tags. Where a stream site shows viewers, this shows
 * what is riding on the stream.
 */
export function StreamCard({ listing, reason, rank }: { listing: StreamListing; /** Why it was picked, for For you and Trending. */ reason?: string; /** Position in a ranked row. */ rank?: number }) {
  const { streamer, headline } = listing;
  const game = gameOf(headline);
  return (
    <Link href={`/s/${streamer.handle}`} className="stream-card">
      <div className="stream-thumb">
        <GameArt id={headline.gameId} name={game.name} />
        <span className="live-badge">LIVE</span>
        {rank && <span className="rank-badge">#{rank}</span>}
        {mockActivityOn() && <span className="viewer-count">{compact(mockViewers(streamer.handle ?? streamer.id))} watching</span>}
        <span className="thumb-count">
          {formatUsd(listing.potMicro)} in the pot · {listing.planters} {listing.planters === 1 ? "planter" : "planters"}
        </span>
      </div>
      <div className="stream-info">
        <Avatar name={streamer.name} handle={streamer.id} src={streamer.profile?.avatarUrl} size={40} />
        <div className="stream-text">
          <strong className="stream-title">{headline.title}</strong>
          <span className="stream-name">{streamer.name}</span>
          <span className="stream-game">{game.name}</span>
          {reason && <span className="stream-reason">{reason}</span>}
          <span className="stream-tags">
            <span className="pill-tag">{headline.status === "locked" ? "Attempt in progress" : "Open for pledges"}</span>
            {listing.liveCount > 1 && <span className="pill-tag">{listing.liveCount} challenges</span>}
            {listing.charity && <span className="pill-tag">Charity</span>}
            {listing.collab && <span className="pill-tag">Collab</span>}
            {listing.session && <span className="pill-tag pill-platform">On {listing.session.platform === "youtube" ? "YouTube" : listing.session.platform === "kick" ? "Kick" : "Twitch"}</span>}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function StreamGrid({ listings, empty, ranked = false }: { listings: (StreamListing & { reason?: string })[]; empty: string; /** Number the cards, for Trending. */ ranked?: boolean }) {
  if (listings.length === 0) return <p className="empty">{empty}</p>;
  return (
    <div className="stream-grid">
      {listings.map((listing, i) => (
        <StreamCard key={listing.streamer.id} listing={listing} reason={listing.reason} rank={ranked ? i + 1 : undefined} />
      ))}
    </div>
  );
}

/**
 * A browse row: streams on a carousel when there are enough to make a ring
 * (three or more), otherwise the plain grid.
 */
export function StreamRow({ listings, empty, label, ranked = false }: { listings: (StreamListing & { reason?: string })[]; empty: string; label: string; ranked?: boolean }) {
  if (listings.length < 3) return <StreamGrid listings={listings} empty={empty} ranked={ranked} />;
  const streams: CarouselStream[] = listings.map((l) => ({
    handle: l.streamer.handle!,
    src: `/api/stream-card/${l.streamer.handle}?v=${l.potMicro}-${l.planters}-${l.headline.id}-${l.headline.status}`,
    title: l.headline.title,
    streamer: l.streamer.name,
    game: gameOf(l.headline).name,
    pot: formatUsd(l.potMicro),
    planters: l.planters,
    status: l.headline.status === "locked" ? "locked" : "open",
    ...(l.reason ? { reason: l.reason } : {}),
    ...(l.session ? { platform: l.session.platform === "youtube" ? "YouTube" : l.session.platform === "kick" ? "Kick" : "Twitch" } : {}),
  }));
  return <LiveCarousel streams={streams} label={label} ranked={ranked} />;
}
