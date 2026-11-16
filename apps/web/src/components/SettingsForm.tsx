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
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const toggle = (key: "acceptingSuggestions" | "announcer" | "overlayQr", label: string) => (
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
          const result = await updateSettingsAction({ ...settings, minPledgeUsd: minPledge, blockedWords: blocked });
          setMessage(result.ok ? { ok: true, text: "Saved. The overlay picks this up within a couple of seconds." } : { ok: false, text: result.error });
          router.refresh();
        });
      }}
    >
      <h3>Stream settings</h3>
      <div className="grid">
        {toggle("acceptingSuggestions", "Let fans suggest challenges")}
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
