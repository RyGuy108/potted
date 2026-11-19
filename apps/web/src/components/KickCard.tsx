"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { kickAction } from "@/app/actions";
import type { KickStatus } from "@/lib/kick";

const ANNOUNCEMENTS = [
  ["started", "Attempt started"],
  ["goal", "Pot reached its goal"],
  ["result", "Final result"],
] as const;

function ago(at: number | null, now: number): string {
  if (!at) return "never";
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return new Date(at).toLocaleDateString();
}

const FLASH: Record<string, string> = {
  kick: "Kick connected. Nothing was posted in your chat.",
  failed: "Kick did not finish connecting. Try again.",
  declined: "You cancelled on Kick, so nothing changed.",
  taken: "That Kick channel is already connected to another Potted account.",
  "not-set-up": "Kick connection is not configured on this server yet.",
};

/** The Kick connection on the Channel page: connect, status, the !potted bot and announcements there. */
export function KickCard({ status, flash, now }: { status: KickStatus; flash?: string; now: number }) {
  const router = useRouter();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(flash && FLASH[flash] ? { ok: flash === "kick", text: FLASH[flash]! } : null);
  const [confirming, setConfirming] = useState<"test" | "disconnect" | null>(null);
  const [pending, start] = useTransition();
  const act = (change: Parameters<typeof kickAction>[0]) =>
    start(async () => {
      const result = await kickAction(change);
      setNote(result.ok ? (result.note ? { ok: true, text: result.note } : null) : { ok: false, text: result.error });
      setConfirming(null);
      router.refresh();
    });

  const c = status.connected;

  return (
    <section className="card kick-card" id="kick">
      <div className="voice-head">
        <div>
          <h3>Kick</h3>
          <p className="muted small">Answers !potted and !potted top in your Kick chat with your open challenge and the link to back it. Kick chat never counts as proof for a challenge.</p>
        </div>
        {c && (
          <span className={`kick-live kick-live-${c.live}`} title={c.liveCheckedAt ? `Checked ${ago(c.liveCheckedAt, now)}` : "Not checked yet"}>
            {c.live === "live" ? "Live" : c.live === "offline" ? "Offline" : "Status unknown"}
          </span>
        )}
      </div>

      {!status.configured && !c && (
        <p className="muted small">
          Kick connection is not configured. The site owner adds <code>KICK_CLIENT_ID</code> and <code>KICK_CLIENT_SECRET</code> on the server (see docs/keys.md); then a Connect Kick button appears here.
        </p>
      )}

      {status.configured && !c && (
        <div className="kick-connect">
          <p className="muted small">Potted asks Kick to read your account and channel, read your chat events, and post in your chat. It cannot moderate, change your channel, or see your stream key.</p>
          <a className="btn btn-primary" href="/api/connect/kick/start">
            Connect Kick
          </a>
        </div>
      )}

      {c && (
        <>
          <p>
            Connected to{" "}
            {c.url ? (
              <a href={c.url} target="_blank" rel="noreferrer">
                kick.com/{c.slug}
              </a>
            ) : (
              <strong>{c.slug}</strong>
            )}
            {c.name && c.name.toLowerCase() !== c.slug.toLowerCase() ? <span className="muted"> as {c.name}</span> : null}
          </p>

          {c.needsReconnect && (
            <p className="kick-warn small">
              Kick ended this connection, so the bot is paused. <a href="/api/connect/kick/start">Reconnect Kick</a>
            </p>
          )}
          {c.missingScopes.length > 0 && !c.needsReconnect && (
            <p className="kick-warn small">
              Kick did not grant {c.missingScopes.join(", ")}. <a href="/api/connect/kick/start">Reconnect Kick</a> and allow every permission.
            </p>
          )}

          <ul className="kick-toggles">
            <li>
              <label>
                <input type="checkbox" checked={c.commands} disabled={pending} onChange={(e) => act({ kind: "options", commands: e.target.checked })} />
                <span>
                  Answer <code>!potted</code> and <code>!potted top</code>
                </span>
              </label>
            </li>
            {ANNOUNCEMENTS.map(([kind, label]) => (
              <li key={kind}>
                <label>
                  <input type="checkbox" checked={c.announce[kind]} disabled={pending} onChange={(e) => act({ kind: "options", announce: { [kind]: e.target.checked } })} />
                  <span>Announce: {label.toLowerCase()}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="muted small">The main chat bot switch above also pauses Kick. Announcements start off.</p>

          <dl className="kick-diag small">
            <div>
              <dt>Chat events</dt>
              <dd>{c.subscriptions.healthy ? "Subscribed" : c.subscriptions.error ? `Problem: ${c.subscriptions.error}` : `Missing: ${c.subscriptions.missing.join(", ")}`}</dd>
            </div>
            <div>
              <dt>Last event from Kick</dt>
              <dd>{ago(c.lastEventAt, now)}</dd>
            </div>
            <div>
              <dt>Last message sent</dt>
              <dd>{ago(c.lastSentAt, now)}</dd>
            </div>
            {c.queued > 0 && (
              <div>
                <dt>Waiting to send</dt>
                <dd>{c.queued}</dd>
              </div>
            )}
            {c.lastError && (
              <div>
                <dt>Last problem</dt>
                <dd>
                  {c.lastError.message} ({ago(c.lastError.at, now)})
                </dd>
              </div>
            )}
          </dl>

          <div className="kick-actions">
            {confirming === "test" ? (
              <>
                <span className="small">This posts a message in your public Kick chat.</span>
                <button type="button" className="btn btn-primary" disabled={pending} onClick={() => act({ kind: "test", confirm: "post-publicly" })}>
                  Post it
                </button>
                <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => setConfirming(null)}>
                  Cancel
                </button>
              </>
            ) : confirming === "disconnect" ? (
              <>
                <span className="small">Stops the bot, removes Potted&apos;s chat subscriptions, and revokes access.</span>
                <button type="button" className="btn btn-primary" disabled={pending} onClick={() => act({ kind: "disconnect" })}>
                  Disconnect
                </button>
                <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => setConfirming(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-ghost" disabled={pending || c.needsReconnect} onClick={() => setConfirming("test")}>
                  Send test message
                </button>
                <button type="button" className="btn btn-ghost" disabled={pending || c.needsReconnect} onClick={() => act({ kind: "repair" })}>
                  {pending ? "Working…" : "Repair connection"}
                </button>
                <a className="btn btn-ghost" href="/api/connect/kick/start">
                  Reconnect
                </a>
                <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => setConfirming("disconnect")}>
                  Disconnect
                </button>
              </>
            )}
          </div>
        </>
      )}

      {note && <p className={`small ${note.ok ? "muted" : "kick-warn"}`}>{note.text}</p>}
    </section>
  );
}
