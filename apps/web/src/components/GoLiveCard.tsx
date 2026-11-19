"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { endStreamAction, goLiveAction } from "@/app/actions";
import type { LiveSession } from "@/lib/store";

const NAMES = { twitch: "Twitch", youtube: "YouTube", kick: "Kick" } as const;

/**
 * How a climber tells Potted they're streaming: paste the link. Potted
 * links that channel and fills the new-challenge form with the stream's game.
 */
export function GoLiveCard({ session, gameName }: { session: LiveSession | null; gameName: string | null }) {
  const router = useRouter();
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (session) {
    return (
      <section className="card go-live on" data-testid="go-live">
        <div className="go-live-main">
          <span className="live-pill">
            <span className="live-dot" aria-hidden="true" /> Live on {NAMES[session.platform]}
          </span>
          <h3>{session.title ?? (session.channel ? `${NAMES[session.platform]} · ${session.channel}` : "Your stream")}</h3>
          <p className="muted small">
            {gameName ? `Playing ${gameName}. ` : ""}Fans see you on Browse and in the extension, with a link to watch.
            {gameName ? " Your next challenge starts on this game." : ""}
          </p>
        </div>
        <div className="go-live-actions">
          <a className="btn btn-ghost" href={session.url} target="_blank" rel="noreferrer">
            Open stream
          </a>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await endStreamAction();
                router.refresh();
              })
            }
          >
            End stream
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="card go-live" data-testid="go-live">
      <div className="go-live-main">
        <h3>Going live?</h3>
        <p className="muted small">Paste your Twitch, YouTube or Kick link. Potted links the channel and fills in your stream&apos;s title and game.</p>
      </div>
      <form
        className="go-live-form"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const result = await goLiveAction(link);
            if (!result.ok) setError(result.error);
            else setLink("");
            router.refresh();
          });
        }}
      >
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="twitch.tv/yourname" aria-label="Stream link" required />
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Checking…" : "Go live"}
        </button>
      </form>
      {error && <p className="error small">{error}</p>}
    </section>
  );
}
