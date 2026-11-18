"use client";

import { GAMES } from "@potted/core";
import { useState, useTransition } from "react";
import { postBountyAction, suggestAction } from "@/app/actions";

/** A fan pitches a challenge. The streamer decides whether to open it. */
export function SuggestForm({
  handle,
  streamerName,
  bounties = false,
  ideas = true,
  games,
}: {
  /** Game ids this climber takes. Every game when omitted or empty. */
  games?: string[];
  handle: string;
  streamerName: string;
  /** The streamer takes bounties: ideas with money on them. */
  bounties?: boolean;
  /** The streamer takes free ideas. */
  ideas?: boolean;
}) {
  const [withMoney, setWithMoney] = useState(!ideas);
  const [amount, setAmount] = useState("5");
  const [hours, setHours] = useState("24");
  const offered = games && games.length > 0 ? GAMES.filter((g) => games.includes(g.id)) : GAMES;
  const [gameId, setGameId] = useState(offered[0]!.id);
  const [text, setText] = useState("");
  const [customGame, setCustomGame] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="card suggest"
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        start(async () => {
          const result = withMoney
            ? await postBountyAction({ handle, gameId, text, customGame, amountUsd: Number(amount), hours: Number(hours) })
            : await suggestAction(handle, gameId, text, customGame);
          setMessage(
            result.ok
              ? {
                  ok: true,
                  text: withMoney
                    ? `Bounty posted. Your $${amount} is held until ${streamerName} takes it on, and comes back if not.`
                    : `Sent. ${streamerName} sees it on the dashboard.`,
                }
              : { ok: false, text: result.error },
          );
          if (result.ok) setText("");
        });
      }}
    >
      <h3>{withMoney ? "Post a bounty" : "Suggest a challenge"}</h3>
      <p className="muted small">
        {withMoney
          ? `Put money on your idea. Others can add to it. It becomes a challenge if ${streamerName} takes it on; otherwise everyone gets their money back.`
          : `Nothing is charged for an idea. If ${streamerName} opens it, anyone can fund it.`}
      </p>
      <label className="field">
        <span>Game</span>
        <select value={gameId} onChange={(e) => setGameId(e.target.value)}>
          {offered.map((game) => (
            <option key={game.id} value={game.id}>
              {game.name}
            </option>
          ))}
        </select>
      </label>
      {gameId === "other" && (
        <label className="field">
          <span>Which game or activity?</span>
          <input value={customGame} maxLength={40} onChange={(e) => setCustomGame(e.target.value)} placeholder="Any game, even one not listed here" />
        </label>
      )}
      <label className="field">
        <span>Your idea</span>
        <textarea
          value={text}
          maxLength={140}
          onChange={(e) => setText(e.target.value)}
          placeholder="Win a bullet game against someone rated 1800 or higher"
          required
        />
      </label>
      {bounties && ideas && (
        <label className="check">
          <input type="checkbox" checked={withMoney} onChange={(e) => setWithMoney(e.target.checked)} />
          Put money on it (make it a bounty)
        </label>
      )}
      {withMoney && (
        <div className="grid">
          <label className="field">
            <span>Your amount ($)</span>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <label className="field">
            <span>Open for</span>
            <select value={hours} onChange={(e) => setHours(e.target.value)}>
              {[1, 6, 24, 72].map((h) => (
                <option key={h} value={h}>
                  {h === 1 ? "1 hour" : `${h} hours`}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="row">
        <button className={withMoney ? "btn btn-primary" : "btn btn-ghost"} disabled={pending || text.trim().length < 8}>
          {pending ? "Sending…" : withMoney ? `Post bounty with $${amount || 0}` : "Send idea"}
        </button>
        {message && (
          <span className={message.ok ? "success" : "error"} role="status">
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
