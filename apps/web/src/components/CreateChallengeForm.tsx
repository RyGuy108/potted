"use client";

import { GAMES } from "@potted/core";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createChallengeAction } from "@/app/actions";

type Fields = Record<string, string>;

const DEFAULTS: Fields = {
  username: "",
  speed: "bullet",
  minOpponentRating: "",
  playerTag: "",
  wins: "2",
  battles: "3",
  accountName: "",
  goal: "wins",
  count: "1",
  game: "",
  statement: "",
  disputeWindowSecs: "120",
  goalUsd: "20",
  pledgeCapUsd: "10",
  minutes: "30",
};

function conditionFor(gameId: string, f: Fields): unknown {
  const game = GAMES.find((g) => g.id === gameId)!;
  switch (game.verifier) {
    case "lichess":
      return { kind: "lichess", username: f.username, speed: f.speed, minOpponentRating: f.minOpponentRating };
    case "brawlstars":
      return { kind: "brawlstars", playerTag: f.playerTag, wins: f.wins, battles: f.battles };
    case "fortnite":
      return { kind: "fortnite", accountName: f.accountName, goal: f.goal, count: f.count };
    case "optimistic":
      return {
        kind: "optimistic",
        game: gameId === "gta6" ? "GTA VI" : f.game,
        statement: f.statement,
        disputeWindowSecs: f.disputeWindowSecs,
      };
  }
}

export interface SuggestionSeed {
  id: string;
  fanName: string;
  gameId: string;
  text: string;
}

/** Suggested terms from the coordinator. They only pre-fill the form. */
export interface DraftSeed {
  fields: Record<string, string>;
  note: string;
  source: "grok" | "rules";
}

export function CreateChallengeForm({
  warnings,
  suggestion,
  draft,
}: {
  warnings: Record<string, string | null>;
  /** A fan idea the streamer chose to turn into a challenge. */
  suggestion?: SuggestionSeed;
  draft?: DraftSeed;
}) {
  const router = useRouter();
  const [gameId, setGameId] = useState(suggestion?.gameId ?? "chess");
  const [fields, setFields] = useState<Fields>({ ...DEFAULTS, statement: suggestion?.text ?? "", ...draft?.fields });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const game = GAMES.find((g) => g.id === gameId)!;
  const warning = warnings[game.verifier];

  const input = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="field">
      <span>{label}</span>
      <input value={fields[name]} onChange={(e) => setFields({ ...fields, [name]: e.target.value })} {...props} />
    </label>
  );
  const select = (name: string, label: string, options: [string, string][]) => (
    <label className="field">
      <span>{label}</span>
      <select value={fields[name]} onChange={(e) => setFields({ ...fields, [name]: e.target.value })}>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <form
      className="card create"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const result = await createChallengeAction(
            {
              gameId,
              condition: conditionFor(gameId, fields),
              goalUsd: Number(fields.goalUsd),
              pledgeCapUsd: Number(fields.pledgeCapUsd),
              minutes: Number(fields.minutes),
            },
            suggestion?.id,
          );
          if (!result.ok) return setError(result.error);
          setFields({ ...fields, statement: "" });
          // Drops ?use=… so the form goes back to a blank challenge.
          router.replace("/dashboard");
          router.refresh();
        });
      }}
    >
      <h3>New challenge</h3>
      {suggestion && (
        <p className="hint">
          From {suggestion.fanName}: &ldquo;{suggestion.text}&rdquo;. Set the exact terms below; fans fund what you write, not the idea.
          {draft && (
            <span className="draft-note">
              <span className="tag tag-quiet">{draft.source === "grok" ? "Drafted by Grok" : "Drafted by rules"}</span> {draft.note}
            </span>
          )}
        </p>
      )}
      <div className="game-tabs" role="tablist" aria-label="Game">
        {GAMES.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={g.id === gameId}
            className={g.id === gameId ? "tab tab-on" : "tab"}
            onClick={() => setGameId(g.id)}
          >
            {g.name}
          </button>
        ))}
      </div>
      <p className="muted small">{game.how}</p>
      {warning && <p className="warn small">{warning}</p>}

      <div className="grid">
        {game.verifier === "lichess" && (
          <>
            {input("username", "Lichess username", { placeholder: "your_lichess_name", required: true })}
            {select("speed", "Time control", [
              ["bullet", "Bullet"],
              ["blitz", "Blitz"],
              ["rapid", "Rapid"],
              ["", "Any"],
            ])}
            {input("minOpponentRating", "Opponent rating floor (optional)", { inputMode: "numeric", placeholder: "e.g. 1500" })}
          </>
        )}
        {game.verifier === "brawlstars" && (
          <>
            {input("playerTag", "Player tag", { placeholder: "#2PP0LYQ", required: true })}
            {input("wins", "Wins needed", { inputMode: "numeric", required: true })}
            {input("battles", "Out of next battles", { inputMode: "numeric", required: true })}
          </>
        )}
        {game.verifier === "fortnite" && (
          <>
            {input("accountName", "Epic account name", { required: true })}
            {select("goal", "Goal", [
              ["wins", "Victory Royales"],
              ["kills", "Eliminations"],
            ])}
            {input("count", "How many", { inputMode: "numeric", required: true })}
          </>
        )}
        {game.verifier === "optimistic" && (
          <>
            {gameId !== "gta6" && input("game", "Game or activity", { placeholder: "Cooking stream", required: true })}
            {input("statement", "Challenge", { placeholder: "Finish the first heist without getting busted", required: true })}
            {input("disputeWindowSecs", "Dispute window (seconds)", { inputMode: "numeric", required: true })}
          </>
        )}
      </div>

      <div className="grid">
        {input("goalUsd", "Reaches the clouds at ($)", { inputMode: "decimal", required: true })}
        {input("pledgeCapUsd", "Per-fan limit ($)", { inputMode: "decimal", required: true })}
        {input("minutes", "Deadline (minutes from now)", { inputMode: "numeric", required: true })}
      </div>

      <div className="row">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Creating…" : "Open for pledges"}
        </button>
        {error && (
          <span className="error" role="alert">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
