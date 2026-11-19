import { GAMES, type GameInfo } from "@potted/core";
import Link from "next/link";
import { CategoryArt } from "./CategoryArt";
import { Icon } from "./Icon";
import { Marquee } from "./Marquee";

function Tile({ game }: { game: GameInfo }) {
  return (
    <Link href={`/g/${game.id}`} className="card game" draggable={false}>
      <CategoryArt id={game.id} name={game.name} />
      <div className="game-text">
        <div className="meta">
          <h3>{game.name}</h3>
          <span className="tag tag-quiet">
            <Icon name={game.verifier === "optimistic" ? "clip" : "data"} size={14} />
            {game.verifier === "optimistic" ? "Clip + dispute" : "Game data"}
          </span>
        </div>
        <p className="muted">{game.how}</p>
        {game.example && <p className="game-example">&ldquo;{game.example}&rdquo;</p>}
        <span className="game-go">See who is live</span>
      </div>
    </Link>
  );
}

/** Every kind of stream Potted supports, as a strip that drifts by and can be dragged. */
export function GameDirectory() {
  // "Anything else" reads best as the last tile before the loop restarts.
  const games = [...GAMES.filter((g) => g.id !== "other"), ...GAMES.filter((g) => g.id === "other")];
  return (
    <Marquee label="Supported games and stream types">
      {games.map((game) => (
        <Tile key={game.id} game={game} />
      ))}
    </Marquee>
  );
}
