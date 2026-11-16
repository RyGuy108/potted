"use client";

import { GAMES } from "@potted/core";
import { useState } from "react";
import { Icon } from "./Icon";

/**
 * The kinds of stream Potted supports. Featured ones show first; the rest
 * open with "Show more", so the list can keep growing without taking over
 * the page.
 */
export function GameDirectory() {
  const [open, setOpen] = useState(false);
  const featured = GAMES.filter((g) => g.featured);
  const more = GAMES.filter((g) => !g.featured);
  const shown = open ? [...featured.filter((g) => g.id !== "other"), ...more, ...featured.filter((g) => g.id === "other")] : featured;
  return (
    <>
      <div className="games" id="stream-types">
        {shown.map((game) => (
          <div key={game.id} className="card game">
            <div className="meta">
              <h3>{game.name}</h3>
              <span className="tag tag-quiet">
                <Icon name={game.verifier === "optimistic" ? "clip" : "data"} size={13} />
                {game.verifier === "optimistic" ? "Clip + dispute" : "Game data"}
              </span>
            </div>
            <p className="muted small">{game.how}</p>
            {game.example && <p className="game-example small">&ldquo;{game.example}&rdquo;</p>}
          </div>
        ))}
      </div>
      {more.length > 0 && (
        <button type="button" className="btn btn-ghost show-more" aria-expanded={open} aria-controls="stream-types" onClick={() => setOpen(!open)}>
          {open ? "Show fewer" : `Show ${more.length} more stream types`}
        </button>
      )}
    </>
  );
}
