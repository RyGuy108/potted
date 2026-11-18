import { GAMES } from "@potted/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChallengeCard } from "@/components/ChallengeCard";
import { GameArt } from "@/components/GameArt";
import { AutoRefresh } from "@/components/Live";
import { StreamGrid } from "@/components/StreamCard";
import { liveStreams, recentResults } from "@/lib/service";

/** Everyone running Potted challenges in one game or stream type. */
export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = GAMES.find((g) => g.id === id);
  if (!game) notFound();
  const live = liveStreams(game.id);
  const recent = recentResults(game.id);
  return (
    <>
      {/* Opened from Browse, which already animated in; this page just appears. */}
      <span className="no-enter" hidden />
      <AutoRefresh everyMs={5000} />
      <div className="game-head">
        <div className="game-cover">
          <GameArt id={game.id} name={game.name} />
        </div>
        <div>
          <p className="eyebrow">
            <Link href="/browse">Browse</Link> / {game.verifier === "optimistic" ? "Settled by clip" : "Checked against game data"}
          </p>
          <h1>{game.name}</h1>
          <p className="lede">{game.how}</p>
          <p className="muted">
            <strong className="mono">{live.length}</strong> {live.length === 1 ? "stream" : "streams"} live with Potted
          </p>
        </div>
      </div>

      <h2 className="directory-title">
        Live in <span>{game.name}</span>
      </h2>
      <StreamGrid listings={live} empty={`No one is running a ${game.name} challenge right now. Streams appear here the moment a climber opens one.`} />

      {recent.length > 0 && (
        <>
          <h2>Recently settled</h2>
          <div className="list">
            {recent.map((c) => (
              <ChallengeCard key={c.id} challenge={c} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
