"use client";

import { GAMES } from "@potted/core";
import { useState, useTransition } from "react";
import { suggestAction } from "@/app/actions";

/** A fan pitches a challenge. The streamer decides whether to open it. */
export function SuggestForm({ handle, streamerName }: { handle: string; streamerName: string }) {
  const [gameId, setGameId] = useState(GAMES[0]!.id);
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
          const result = await suggestAction(handle, gameId, text, customGame);
          setMessage(result.ok ? { ok: true, text: `Sent. ${streamerName} sees it on the dashboard.` } : { ok: false, text: result.error });
          if (result.ok) setText("");
        });
      }}
    >
      <h3>Suggest a challenge</h3>
      <p className="muted small">Nothing is charged for an idea. If {streamerName} opens it, anyone can fund it.</p>
      <label className="field">
        <span>Game</span>
        <select value={gameId} onChange={(e) => setGameId(e.target.value)}>
          {GAMES.map((game) => (
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
      <div className="row">
        <button className="btn btn-ghost" disabled={pending || text.trim().length < 8}>
          {pending ? "Sending…" : "Send idea"}
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
