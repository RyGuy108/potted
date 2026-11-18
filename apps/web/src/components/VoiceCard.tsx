"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { cloneVoiceAction, removeVoiceAction } from "@/app/actions";

/**
 * The streamer's own announcer voice: upload a few recordings, confirm they
 * are your voice, and ElevenLabs clones it. It can be previewed and deleted
 * at any time.
 */
export function VoiceCard({ own, consentAt, ready }: { own: boolean; consentAt: number | null; /** Whether an ElevenLabs key is set. */ ready: boolean }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [playing, setPlaying] = useState(false);

  async function preview() {
    setPlaying(true);
    try {
      const res = await fetch("/api/tts?preview=1", { cache: "no-store" });
      if (res.status === 200) await new Audio(URL.createObjectURL(await res.blob())).play();
      else setMessage({ ok: false, text: "No preview: ElevenLabs is not set up." });
    } finally {
      setTimeout(() => setPlaying(false), 2500);
    }
  }

  return (
    <section className="card voice-card" id="voice">
      <div className="voice-head">
        <div>
          <h3>Your own announcer voice</h3>
          <p className="muted small">Pledges and milestones read in your voice, cloned by ElevenLabs from a minute or two of you talking.</p>
        </div>
        {own && <span className="pill pill-on">In use</span>}
      </div>
      {own ? (
        <div className="voice-actions">
          <button type="button" className="btn btn-ghost" onClick={preview} disabled={playing}>
            {playing ? "Playing…" : "Hear a preview"}
          </button>
          <button
            type="button"
            className="btn btn-ghost danger"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const result = await removeVoiceAction();
                setMessage(result.ok ? { ok: true, text: "Deleted. The announcer is back to a stock voice." } : { ok: false, text: result.error });
                router.refresh();
              })
            }
          >
            Delete my voice
          </button>
          {consentAt && <span className="muted small">Cloned with your consent on {new Date(consentAt).toLocaleDateString()}.</span>}
        </div>
      ) : !ready ? (
        <p className="muted small">Needs an ElevenLabs key on the server (ELEVENLABS_API_KEY).</p>
      ) : (
        <form
          ref={form}
          className="voice-form"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            setMessage(null);
            start(async () => {
              const result = await cloneVoiceAction(data);
              setMessage(result.ok ? { ok: true, text: "Done. Your voice now reads your events. Try the preview." } : { ok: false, text: result.error });
              if (result.ok) form.current?.reset();
              router.refresh();
            });
          }}
        >
          <label className="field">
            <span>Recordings of you talking (up to 3, 10 MB each)</span>
            <input type="file" name="samples" accept="audio/*" multiple required />
          </label>
          <label className="check">
            <input type="checkbox" name="consent" required />
            These recordings are my own voice, and I agree to ElevenLabs cloning it for my stream&apos;s announcer. I can delete it any time.
          </label>
          <button className="btn btn-primary" disabled={pending}>
            {pending ? "Cloning…" : "Clone my voice"}
          </button>
        </form>
      )}
      {message && <p className={message.ok ? "good small" : "error small"}>{message.text}</p>}
    </section>
  );
}
