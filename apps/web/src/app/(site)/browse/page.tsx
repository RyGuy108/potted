import { GAMES, formatUsd } from "@potted/core";
import { compact, mockActivityOn, mockGame, mockTotals } from "@/lib/mock-activity";
import Link from "next/link";
import { GameArt } from "@/components/GameArt";
import { AutoRefresh } from "@/components/Live";
import { StreamGrid } from "@/components/StreamCard";
import { liveCountsByGame, liveStreams } from "@/lib/service";

/** Every stream with a live challenge, then every game and stream type. */
export default function Browse() {
  const live = liveStreams();
  const counts = liveCountsByGame();
  // Games with live streams first, then the rest in their usual order.
  const mock = mockActivityOn();
  const audience = (id: string) => (mock ? mockGame(id) : { streams: 0, watching: 0 });
  const games = [...GAMES].sort((a, b) => (counts[b.id] ?? 0) + audience(b.id).streams - ((counts[a.id] ?? 0) + audience(a.id).streams));
  const totals = mock ? mockTotals(GAMES.map((g) => g.id)) : null;
  const potMicro = live.reduce((sum, l) => sum + l.potMicro, 0);
  return (
    <>
      <AutoRefresh everyMs={5000} />
      <h1 className="directory-title">
        Live <span>with Potted</span>
      </h1>
      {totals && (
        <p className="browse-stats">
          <span>
            <span className="live-dot" aria-hidden="true" />
            <strong>{compact(totals.watching + live.length)}</strong> watching now
          </span>
          <span>
            <strong>{totals.streams + live.length}</strong> streams live
          </span>
          <span>
            <strong>{formatUsd(potMicro)}</strong> in live Potted pots
          </span>
        </p>
      )}
      <StreamGrid listings={live} empty="No challenges are live right now. Streams appear here the moment a climber opens one." />

      <h2>Games and stream types</h2>
      <div className="category-grid">
        {games.map((game) => (
          <Link key={game.id} href={`/g/${game.id}`} className="category">
            <GameArt id={game.id} name={game.name} />
            <strong>{game.name}</strong>
            <span className="muted small">
              {mock
                ? `${(counts[game.id] ?? 0) + audience(game.id).streams} live · ${compact(audience(game.id).watching)} watching`
                : counts[game.id]
                  ? `${counts[game.id]} live`
                  : "No one live"}
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
