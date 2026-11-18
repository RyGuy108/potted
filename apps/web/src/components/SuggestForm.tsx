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
                    ? `Request sent. Your $${amount} is held until ${streamerName} answers. It's theirs once they start the attempt; if they pass, it comes back.`
                    : `Sent. ${streamerName} sees it on the dashboard.`,
                }
              : { ok: false, text: result.error },
          );
          if (result.ok) setText("");
        });
      }}
    >
      <h3>Ask {streamerName} for a challenge</h3>
      {bounties && ideas && (
        <div className="choice" role="radiogroup" aria-label="Free idea or funded request">
          <button type="button" role="radio" aria-checked={!withMoney} className={!withMoney ? "on" : undefined} onClick={() => setWithMoney(false)}>
            <strong>Just suggest</strong>
            <span>Free. Anyone can back it if it opens.</span>
          </button>
          <button type="button" role="radio" aria-checked={withMoney} className={withMoney ? "on" : undefined} onClick={() => setWithMoney(true)}>
            <strong>Fund the request</strong>
            <span>Paid when they take it on and start.</span>
          </button>
        </div>
      )}
      <p className="muted small">
        {withMoney
          ? `Your money goes to ${streamerName} when they take this on and start the attempt, whether or not they pull it off. If they pass, or never start, it comes back. Other fans can add to it.`
          : `Nothing is charged for an idea. If ${streamerName} opens it, fans can back it, and that money pays only if it's completed.`}
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
      {withMoney && (
        <div className="grid">
          <label className="field">
            <span>Your amount ($)</span>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <label className="field">
            <span>Waits for an answer for</span>
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
          {pending ? "Sending…" : withMoney ? `Send request with $${amount || 0}` : "Send idea"}
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
