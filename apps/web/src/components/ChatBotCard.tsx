"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { chatBotAction } from "@/app/actions";

interface Status {
  on: boolean;
  twitch: { ready: boolean; channel: string | null };
  kick: { ready: boolean; connected: string | null };
  youtube: { ready: boolean; connected: string | null };
}

/** The !potted bot: where it is connected, and a test message. */
export function ChatBotCard({ status }: { status: Status }) {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (change: Parameters<typeof chatBotAction>[0]) =>
    start(async () => {
      const result = await chatBotAction(change);
      if (!result.ok) setNote(result.error);
      else if (change.test) setNote(result.sent?.length ? `Sent to ${result.sent.join(", ")}.` : "Nothing sent: connect Twitch or YouTube first. Kick has its own test button below.");
      router.refresh();
    });

  const row = (name: string, state: string, action?: React.ReactNode) => (
    <li>
      <strong>{name}</strong>
      <span className="muted small">{state}</span>
      {action}
    </li>
  );

  return (
    <section className="card chat-bot" id="chat-bot">
      <div className="voice-head">
        <div>
          <h3>!potted chat bot</h3>
          <p className="muted small">Answers !potted in your chat with the open challenge and a one-tap link to back it, and posts when an attempt starts, a pot hits its goal, and the result.</p>
        </div>
        <button type="button" className={`btn ${status.on ? "btn-primary" : "btn-ghost"}`} disabled={pending} onClick={() => act({ on: !status.on })}>
          {status.on ? "On" : "Off"}
        </button>
      </div>
      <ul className="chat-bot-list">
        {row(
          "Twitch",
          !status.twitch.ready ? "Needs the Potted bot account on the server (TWITCH_BOT_USERNAME, TWITCH_BOT_TOKEN)" : status.twitch.channel ? `In twitch.tv/${status.twitch.channel}` : "Add your Twitch channel in the settings above",
        )}
        {row("Kick", status.kick.connected ? `Connected: kick.com/${status.kick.connected}` : "Not connected", <a className="btn btn-ghost" href="#kick">Kick settings</a>)}
        {row(
          "YouTube",
          !status.youtube.ready ? "Needs Google sign-in keys on the server" : status.youtube.connected ? `Connected: ${status.youtube.connected} (reads chat while you're live)` : "Not connected",
          status.youtube.ready &&
            (status.youtube.connected ? (
              <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => act({ disconnect: "youtube" })}>
                Disconnect
              </button>
            ) : (
              <a className="btn btn-ghost" href="/api/connect/youtube/start">
                Connect YouTube
              </a>
            )),
        )}
      </ul>
      <div>
        <button type="button" className="btn btn-ghost" disabled={pending || !status.on} onClick={() => act({ test: true })}>
          Send a test message
        </button>
        {note && <span className="muted small"> {note}</span>}
      </div>
    </section>
  );
}
