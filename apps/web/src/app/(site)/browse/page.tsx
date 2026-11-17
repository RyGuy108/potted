import { GAMES } from "@potted/core";
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
  const games = [...GAMES].sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0));
  return (
    <>
      <AutoRefresh everyMs={5000} />
      <h1 className="directory-title">
        Live <span>with Potted</span>
      </h1>
      <StreamGrid listings={live} empty="No challenges are live right now. Streams appear here the moment a climber opens one." />

      <h2>Games and stream types</h2>
      <div className="category-grid">
        {games.map((game) => (
          <Link key={game.id} href={`/g/${game.id}`} className="category">
            <GameArt id={game.id} name={game.name} />
            <strong>{game.name}</strong>
            <span className="muted small">{counts[game.id] ? `${counts[game.id]} live` : "No one live"}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
