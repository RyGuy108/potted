import { GAMES, formatUsd } from "@potted/core";
import Link from "next/link";
import { CategoryArt } from "@/components/CategoryArt";
import { AutoRefresh } from "@/components/Live";
import { StreamRow } from "@/components/StreamCard";
import { forYou, trending } from "@/lib/discover";
import { liveCountsByGame, liveStreams } from "@/lib/service";
import { currentUser } from "@/lib/session";

/** Every stream with a live challenge, then every game and stream type. */
export default async function Browse({ searchParams }: { searchParams: Promise<{ surprise?: string }> }) {
  const { surprise } = await searchParams;
  const user = await currentUser();
  const live = liveStreams();
  const picks = user?.role === "fan" ? forYou(user, live) : [];
  const hot = trending(live);
  const counts = liveCountsByGame();
  // Games with live streams first, then the rest in their usual order.
  const games = [...GAMES].sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0));
  // Every number here is counted from the live challenges themselves.
  const potMicro = live.reduce((sum, l) => sum + l.potMicro, 0);
  const planters = live.reduce((sum, l) => sum + l.planters, 0);
  const challenges = live.reduce((sum, l) => sum + l.liveCount, 0);
  return (
    <>
      <AutoRefresh everyMs={5000} />
      <div className="row between wrap browse-head">
        <h1 className="directory-title">
          Live <span>with Potted</span>
        </h1>
        <a href="/browse/random" className="btn btn-surprise" data-testid="surprise">
          <Dice /> Surprise me
        </a>
      </div>
      {surprise === "none" && <p className="muted">Nobody is live right now, so there's nothing to pick from. Try again soon.</p>}
      {live.length > 0 && (
        <p className="browse-stats">
          <span>
            <span className="live-dot" aria-hidden="true" />
            <strong>{live.length}</strong> {live.length === 1 ? "stream" : "streams"} live
          </span>
          <span>
            <strong>{challenges}</strong> live {challenges === 1 ? "challenge" : "challenges"}
          </span>
          <span>
            <strong>{planters}</strong> {planters === 1 ? "planter" : "planters"} backing
          </span>
          <span>
            <strong>{formatUsd(potMicro)}</strong> in live pots
          </span>
        </p>
      )}
      {user?.role === "fan" && (
        <section className="browse-row">
          <div className="row-head">
            <h2>For you</h2>
            <span className="muted small">From the climbers you follow and back, and the games you play along with</span>
          </div>
          <StreamRow listings={picks} label="Streams for you" empty="Follow or back a few climbers and streams picked for you show up here." />
        </section>
      )}

      {hot.length > 0 && (
        <section className="browse-row">
          <div className="row-head">
            <h2>Trending</h2>
            <span className="muted small">Most pledges and new planters in the last hour</span>
          </div>
          <StreamRow listings={hot} label="Trending streams" empty="" ranked />
        </section>
      )}

      <section className="browse-row">
        <div className="row-head">
          <h2>All live streams</h2>
          <span className="muted small">{live.length} with a live challenge</span>
        </div>
        <StreamRow listings={live} label="All live streams" empty="No challenges are live right now. Streams appear here the moment a climber opens one." />
      </section>

      <h2>Games and stream types</h2>
      <div className="category-grid">
        {games.map((game) => (
          <Link key={game.id} href={`/g/${game.id}`} className="category">
            <CategoryArt id={game.id} name={game.name} />
            <strong>{game.name}</strong>
            <span className="muted small">
              {counts[game.id] ? `${counts[game.id]} live` : "No one live"}
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}

/** A die, for the surprise button. */
function Dice() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
      <circle cx="15.5" cy="15.5" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="15.5" cy="8.5" r="1.5" fill="currentColor" />
      <circle cx="8.5" cy="15.5" r="1.5" fill="currentColor" />
    </svg>
  );
}
