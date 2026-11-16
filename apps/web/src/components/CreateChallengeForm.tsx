"use client";

import { GAMES } from "@potted/core";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { inviteAction, createChallengeAction } from "@/app/actions";

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
        // Only "Anything else" asks what the activity is; the rest are named by their type.
        game: gameId === "other" ? f.game : game.name,
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
  partners = [],
}: {
  /** Other streamers who can be invited to share the challenge. */
  partners?: { handle: string; name: string }[];
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
  const [partner, setPartner] = useState("");
  const [partnerPct, setPartnerPct] = useState("50");
  const [sent, setSent] = useState<string | null>(null);
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
        setSent(null);
        start(async () => {
          const terms = {
            gameId,
            condition: conditionFor(gameId, fields),
            goalUsd: Number(fields.goalUsd),
            pledgeCapUsd: Number(fields.pledgeCapUsd),
            minutes: Number(fields.minutes),
          };
          const result = partner ? await inviteAction(partner, Number(partnerPct), terms) : await createChallengeAction(terms, suggestion?.id);
          if (!result.ok) return setError(result.error);
          if (partner) {
            setSent(`Invite sent to ${partners.find((p) => p.handle === partner)?.name}. The challenge opens when they accept.`);
            setPartner("");
          }
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
        {GAMES.filter((g) => g.featured || g.id === gameId).map((g) => (
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
      {GAMES.some((g) => !g.featured) && (
        <label className="field more-types">
          <span>More stream types</span>
          <select value={game.featured ? "" : gameId} onChange={(e) => e.target.value && setGameId(e.target.value)}>
            <option value="">Choose…</option>
            {GAMES.filter((g) => !g.featured).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      )}
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
            {gameId === "other" && input("game", "Game or activity", { placeholder: "Cooking stream", required: true })}
            {input("statement", "Challenge", { placeholder: game.example ?? "Something a viewer can confirm from a clip", required: true })}
            {input("disputeWindowSecs", "Dispute window (seconds)", { inputMode: "numeric", required: true })}
          </>
        )}
      </div>

      <div className="grid">
        {input("goalUsd", "Reaches the clouds at ($)", { inputMode: "decimal", required: true })}
        {input("pledgeCapUsd", "Per-fan limit ($)", { inputMode: "decimal", required: true })}
        {input("minutes", "Deadline (minutes from now)", { inputMode: "numeric", required: true })}
      </div>

      {partners.length > 0 && (
        <div className="grid collab-fields">
          <label className="field">
            <span>Collab with (optional)</span>
            <select value={partner} onChange={(e) => setPartner(e.target.value)}>
              <option value="">Just me</option>
              {partners.map((p) => (
                <option key={p.handle} value={p.handle}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {partner && (
            <label className="field">
              <span>Their share of the pot (%)</span>
              <input inputMode="numeric" value={partnerPct} onChange={(e) => setPartnerPct(e.target.value)} required />
            </label>
          )}
        </div>
      )}

      <div className="row">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? (partner ? "Sending…" : "Creating…") : partner ? "Send invite" : "Open for pledges"}
        </button>
        {sent && (
          <span className="success" role="status">
            {sent}
          </span>
        )}
        {error && (
          <span className="error" role="alert">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
