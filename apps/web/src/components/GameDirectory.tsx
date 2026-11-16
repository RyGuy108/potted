import { GAMES, type GameInfo } from "@potted/core";
import { Icon } from "./Icon";

function Tile({ game }: { game: GameInfo }) {
  return (
    <div className="card game">
      <div className="meta">
        <h3>{game.name}</h3>
        <span className="tag tag-quiet">
          <Icon name={game.verifier === "optimistic" ? "clip" : "data"} size={14} />
          {game.verifier === "optimistic" ? "Clip + dispute" : "Game data"}
        </span>
      </div>
      <p className="muted">{game.how}</p>
      {game.example && <p className="game-example">&ldquo;{game.example}&rdquo;</p>}
    </div>
  );
}

/**
 * Every kind of stream Potted supports, drifting right to left. The list
 * is rendered twice so the loop has no seam; the copy is hidden from screen
 * readers. It pauses on hover or keyboard focus, and for visitors who ask
 * for reduced motion it becomes a plain row they scroll themselves.
 */
export function GameDirectory() {
  // "Anything else" reads best as the last tile before the loop restarts.
  const games = [...GAMES.filter((g) => g.id !== "other"), ...GAMES.filter((g) => g.id === "other")];
  return (
    <div className="marquee" tabIndex={0} role="group" aria-label="Supported games and stream types">
      <div className="marquee-track" style={{ animationDuration: `${games.length * 5}s` }}>
        <div className="marquee-set">
          {games.map((game) => (
            <Tile key={game.id} game={game} />
          ))}
        </div>
        <div className="marquee-set" aria-hidden="true">
          {games.map((game) => (
            <Tile key={game.id} game={game} />
          ))}
        </div>
      </div>
    </div>
  );
}
