import { GAMES } from "@potted/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChallengeCard } from "@/components/ChallengeCard";
import { GameArt } from "@/components/GameArt";
import { AutoRefresh } from "@/components/Live";
import { StreamGrid } from "@/components/StreamCard";
import { type SettledSort, liveStreams, settledIn } from "@/lib/service";

/** Everyone running Potted challenges in one game or stream type. */
const SORTS: [SettledSort, string][] = [
  ["recent", "Most recent"],
  ["pot", "Biggest pot"],
  ["popular", "Most planters"],
  ["completed", "Completed first"],
];

export default async function GamePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sort?: string }> }) {
  const { id } = await params;
  const asked = (await searchParams).sort;
  const sort: SettledSort = SORTS.some(([key]) => key === asked) ? (asked as SettledSort) : "recent";
  const game = GAMES.find((g) => g.id === id);
  if (!game) notFound();
  const live = liveStreams(game.id);
  const recent = settledIn(game.id, sort);
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
          <div className="row between wrap settled-head">
            <h2>Recently settled</h2>
            <nav className="segmented" aria-label="Sort settled challenges">
              {SORTS.map(([key, label]) => (
                <Link key={key} href={`/g/${game.id}?sort=${key}#settled`} className={key === sort ? "on" : undefined} aria-current={key === sort ? "true" : undefined} scroll={false}>
                  {label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="list" id="settled">
            {recent.map((c) => (
              <ChallengeCard key={c.id} challenge={c} showStreamer />
            ))}
          </div>
        </>
      )}
    </>
  );
}
