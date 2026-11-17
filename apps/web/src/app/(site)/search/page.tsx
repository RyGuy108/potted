import Link from "next/link";
import { ChallengeCard } from "@/components/ChallengeCard";
import { GameArt } from "@/components/GameArt";
import { search } from "@/lib/service";

export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").slice(0, 60);
  const results = search(q);
  const total = results.games.length + results.streamers.length + results.challenges.length;
  return (
    <>
      <p className="eyebrow">Search</p>
      <h1>{q.trim().length < 2 ? "Search streams and climbers" : total === 0 ? `Nothing found for “${q}”` : `Results for “${q}”`}</h1>
      {q.trim().length < 2 && <p className="lede">Type a climber&apos;s name, a game, or part of a challenge.</p>}
      {q.trim().length >= 2 && total === 0 && (
        <p className="empty">
          Only climbers who have set up a challenge show up here. <Link href="/browse">Browse what is live</Link>.
        </p>
      )}

      {results.streamers.length > 0 && (
        <>
          <h2>Climbers</h2>
          <div className="streamers">
            {results.streamers.map(({ streamer, challenges, live }) => (
              <Link key={streamer.id} href={`/s/${streamer.handle}`} className="card streamer-card with-avatar">
                <span className="avatar" aria-hidden="true">
                  {streamer.name.charAt(0).toUpperCase()}
                </span>
                <span>
                  <strong>{streamer.name}</strong>
                  <span className="muted small">
                    @{streamer.handle} · {challenges} {challenges === 1 ? "challenge" : "challenges"}
                    {live > 0 ? ` · ${live} live` : ""}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {results.games.length > 0 && (
        <>
          <h2>Games and stream types</h2>
          <div className="category-grid">
            {results.games.map((game) => (
              <Link key={game.id} href={`/g/${game.id}`} className="category">
                <GameArt id={game.id} name={game.name} />
                <strong>{game.name}</strong>
              </Link>
            ))}
          </div>
        </>
      )}

      {results.challenges.length > 0 && (
        <>
          <h2>Challenges</h2>
          <div className="list">
            {results.challenges.map((c) => (
              <ChallengeCard key={c.id} challenge={c} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
