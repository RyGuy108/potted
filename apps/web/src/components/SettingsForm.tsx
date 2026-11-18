"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateSettingsAction } from "@/app/actions";
import type { StreamSettings } from "@/lib/store";
import { VOICES, type VoiceKey } from "@/lib/voices";

const POSITIONS: [StreamSettings["overlayPosition"], string][] = [
  ["bottom-left", "Bottom left"],
  ["bottom-right", "Bottom right"],
  ["top-left", "Top left"],
  ["top-right", "Top right"],
];

/** The streamer's controls for pledges, suggestions and the overlay. */
export function SettingsForm({ initial }: { initial: StreamSettings }) {
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  const [blocked, setBlocked] = useState(initial.blockedWords.join(", "));
  const [minPledge, setMinPledge] = useState(String(initial.minPledgeUsd));
  const [causePct, setCausePct] = useState(String(initial.causePct));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const toggle = (key: "acceptingSuggestions" | "acceptingBounties" | "announcer" | "overlayQr" | "causeOn", label: string) => (
    <label className="check">
      <input
        type="checkbox"
        checked={settings[key]}
        onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })}
      />
      {label}
    </label>
  );

  return (
    <form
      className="card settings"
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        start(async () => {
          const result = await updateSettingsAction({ ...settings, minPledgeUsd: minPledge, blockedWords: blocked, causePct: Number(causePct) });
          setMessage(result.ok ? { ok: true, text: "Saved. The overlay picks this up within a couple of seconds." } : { ok: false, text: result.error });
          router.refresh();
        });
      }}
    >
      <h3>Stream settings</h3>
      <div className="grid">
        {toggle("acceptingSuggestions", "Let fans suggest challenges")}
        {toggle("acceptingBounties", "Let fans post bounties (ideas with money on them)")}
        {toggle("announcer", "Read events aloud on stream")}
        {toggle("overlayQr", "Show a QR code on the overlay")}
      </div>
      <div className="grid">
        <label className="field">
          <span>Smallest pledge ($)</span>
          <input inputMode="decimal" value={minPledge} onChange={(e) => setMinPledge(e.target.value)} required />
        </label>
        <label className="field">
          <span>Announcer voice</span>
          <select value={settings.voice} onChange={(e) => setSettings({ ...settings, voice: e.target.value as VoiceKey })}>
            {VOICES.map((voice) => (
              <option key={voice.key} value={voice.key}>
                {voice.name} ({voice.note})
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Overlay position</span>
          <select
            value={settings.overlayPosition}
            onChange={(e) => setSettings({ ...settings, overlayPosition: e.target.value as StreamSettings["overlayPosition"] })}
          >
            {POSITIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Challenges shown on the overlay</span>
          <select
            value={settings.overlayCards}
            onChange={(e) => setSettings({ ...settings, overlayCards: Number(e.target.value) === 1 ? 1 : 2 })}
          >
            <option value={1}>One</option>
            <option value={2}>Two</option>
          </select>
        </label>
      </div>
      <h3 className="settings-sub">Browser extension</h3>
      <p className="muted small">Link your channel so the Potted extension shows your challenges beside your stream.</p>
      <div className="grid">
        <label className="field">
          <span>Twitch channel</span>
          <input value={settings.twitchChannel} onChange={(e) => setSettings({ ...settings, twitchChannel: e.target.value })} placeholder="yourname" />
        </label>
        <label className="field">
          <span>YouTube handle</span>
          <input value={settings.youtubeChannel} onChange={(e) => setSettings({ ...settings, youtubeChannel: e.target.value })} placeholder="@yourname" />
        </label>
      </div>
      <h3 className="settings-sub">Charity stream</h3>
      <p className="muted small">
        While this is on, every new challenge sends a share of its pot to the cause when it is completed. Missed challenges still refund
        fans in full. Challenges already open keep the terms they opened with.
      </p>
      <div className="grid">
        {toggle("causeOn", "Run this as a charity stream")}
        <label className="field">
          <span>Cause</span>
          <input value={settings.causeName} maxLength={60} onChange={(e) => setSettings({ ...settings, causeName: e.target.value })} placeholder="e.g. Austin Pets Alive" />
        </label>
        <label className="field">
          <span>Share of each completed pot (%)</span>
          <input inputMode="numeric" value={causePct} onChange={(e) => setCausePct(e.target.value)} />
        </label>
        <label className="field">
          <span>Link to the cause (optional)</span>
          <input value={settings.causeUrl} onChange={(e) => setSettings({ ...settings, causeUrl: e.target.value })} placeholder="https://" />
        </label>
      </div>
      <label className="field">
        <span>Blocked words in suggestions (comma-separated)</span>
        <input value={blocked} onChange={(e) => setBlocked(e.target.value)} placeholder="e.g. spoiler, swat" />
      </label>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
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
