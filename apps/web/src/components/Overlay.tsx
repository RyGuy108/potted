"use client";

import { formatUsd, growthOf } from "@potted/core";
import { useEffect, useRef, useState } from "react";
import { Beanstalk } from "./Beanstalk";

interface OverlayChallenge {
  id: string;
  title: string;
  status: string;
  totalMicro: number;
  goalMicro: number;
}

interface OverlayEvent {
  seq: number;
  type: string;
  message: string;
  sfx?: "half" | "goal";
  by?: "grok";
  chain?: { signature: string; confirmedAt: number; streamAt?: number };
}

/** What the toast shows beyond the line: who wrote and voiced it, and how fast a pledge got here. */
interface Shown extends OverlayEvent {
  /** Seconds from the pledge's confirmation on Solana to this screen. */
  speed?: number;
  voiced?: boolean;
}

interface OverlaySettings {
  announcer: boolean;
  position: string;
  cards: number;
  qr: boolean;
}

interface OverlayCause {
  name: string;
  pct: number;
  raisedMicro: number;
  inPlayMicro: number;
}

interface Feed {
  settings: OverlaySettings;
  cause: OverlayCause | null;
  seq: number;
  events: OverlayEvent[];
  challenges: OverlayChallenge[];
  now: number;
}

/** A short built-in chime for when ElevenLabs has no sound effect to give. */
function chime(kind: "half" | "goal"): Promise<void> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return Promise.resolve();
  const ctx = new Ctx();
  const notes = kind === "goal" ? [523.25, 659.25, 783.99, 1046.5] : [659.25, 987.77];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const at = ctx.currentTime + i * 0.12;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.55);
  });
  return new Promise((done) => setTimeout(done, notes.length * 120 + 350));
}

/** The milestone sound effect: ElevenLabs' if there is one, a chime if not. */
async function playSfx(kind: "half" | "goal"): Promise<void> {
  try {
    const res = await fetch(`/api/sfx?kind=${kind}`);
    if (res.status === 200) {
      const audio = new Audio(URL.createObjectURL(await res.blob()));
      await new Promise<void>((done) => {
        audio.onended = () => done();
        audio.onerror = () => done();
        void audio.play().catch(() => done());
      });
      return;
    }
  } catch {
    // fall back to the chime
  }
  await chime(kind);
}

/**
 * Plays the announcer line in the stream's language and voice; falls back to
 * the browser voice with no ElevenLabs key. Reports the words actually
 * spoken (translated, when the stream is in another language) and whether
 * ElevenLabs voiced them.
 */
async function speak(event: OverlayEvent, muted: boolean, onLine: (text: string, voiced: boolean) => void): Promise<void> {
  if (muted) return;
  let text = event.message;
  let lang = "en";
  try {
    const res = await fetch(`/api/tts?seq=${event.seq}`);
    const spoken = res.headers.get("X-Spoken-Text");
    if (spoken) text = decodeURIComponent(spoken);
    lang = res.headers.get("X-Spoken-Lang") ?? "en";
    if (res.status === 200) {
      onLine(text, true);
      const audio = new Audio(URL.createObjectURL(await res.blob()));
      await audio.play();
      return;
    }
  } catch {
    // fall through to the browser voice
  }
  onLine(text, false);
  if ("speechSynthesis" in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    window.speechSynthesis.speak(utterance);
  }
}

const SPOKEN = new Set(["pledged", "locked", "paid", "failed", "claimed", "refunded", "milestone", "recap", "bounty", "redeemed", "gift"]);

export function Overlay({ handle, muted, qrSvg }: { handle: string; muted: boolean; /** QR code to the fan page, as SVG markup made on the server. */ qrSvg: string }) {
  const [challenges, setChallenges] = useState<OverlayChallenge[]>([]);
  const [toast, setToast] = useState<Shown | null>(null);
  const [cause, setCause] = useState<OverlayCause | null>(null);
  const [settings, setSettings] = useState<OverlaySettings>({ announcer: true, position: "bottom-left", cards: 2, qr: false });
  // Read inside the timer callbacks, so a settings change applies without restarting the poll.
  const announcer = useRef(true);
  const since = useRef(-1);
  const queue = useRef<Shown[]>([]);
  const showing = useRef(false);
  /** Server clock minus this browser's clock, so a pledge can be timed from its confirmation. */
  const offset = useRef(0);

  useEffect(() => {
    function next() {
      const event = queue.current.shift() as Shown | undefined;
      if (!event) {
        showing.current = false;
        setToast(null);
        return;
      }
      showing.current = true;
      setToast({ ...event });
      const quiet = muted || !announcer.current;
      void (async () => {
        if (event.sfx && !quiet) await playSfx(event.sfx);
        if (SPOKEN.has(event.type))
          await speak(event, quiet, (text, voiced) => setToast((t) => (t?.seq === event.seq ? { ...t, message: text, voiced } : t)));
      })();
      // The recap is several sentences; give it time to be read.
      setTimeout(next, event.type === "recap" ? 9000 : 4000);
    }

    async function poll() {
      try {
        const res = await fetch(`/api/events?handle=${encodeURIComponent(handle)}&since=${since.current}`, { cache: "no-store" });
        if (!res.ok) return;
        const feed = (await res.json()) as Feed;
        since.current = feed.seq;
        if (feed.now) offset.current = feed.now - Date.now();
        announcer.current = feed.settings.announcer;
        setSettings(feed.settings);
        setCause(feed.cause);
        setChallenges(feed.challenges);
        if (feed.events.length > 0) {
          // Timed as it reaches this screen, so a line waiting in the queue does not look slower.
          const arrived = Date.now() + offset.current;
          queue.current.push(
            ...feed.events.map((e) => (e.type === "pledged" && e.chain?.streamAt ? { ...e, speed: Math.max(0, (arrived - e.chain.confirmedAt) / 1000) } : e)),
          );
          // During a burst, keep every milestone but only the newest pledge,
          // so the toast never falls far behind the pot.
          if (queue.current.length > 2) {
            const lastPledge = [...queue.current].reverse().find((e) => e.type === "pledged");
            queue.current = queue.current.filter((e) => e.type !== "pledged" || e === lastPledge);
          }
          if (!showing.current) next();
        }
      } catch {
        // keep the last frame on screen; the next poll retries
      }
    }

    void poll();
    const timer = setInterval(poll, 1500);
    return () => clearInterval(timer);
  }, [handle, muted]);

  return (
    <div className={`overlay overlay-at-${settings.position}`}>
      {toast && (
        <div key={toast.seq} className={`overlay-toast overlay-${toast.type}${toast.sfx ? ` overlay-sfx-${toast.sfx}` : ""}`}>
          {toast.message}
          {(toast.speed !== undefined || toast.by === "grok") && (
            <span className="overlay-credit">
              {toast.speed !== undefined && (
                <span className="overlay-speed" data-testid="pledge-speed">
                  ⚡ {toast.speed.toFixed(1)}s from confirmation · via QuickNode Streams
                </span>
              )}
              {toast.by === "grok" && <span>Written by Grok{toast.voiced ? " · voiced by ElevenLabs" : ""}</span>}
            </span>
          )}
        </div>
      )}
      <div className="overlay-stack">
        {cause && (
          <div className="overlay-cause">
            <span>For {cause.name}</span>
            <strong className="mono">{formatUsd(cause.raisedMicro)}</strong>
            <span className="muted">raised{cause.inPlayMicro > 0 ? ` · ${formatUsd(cause.inPlayMicro)} more if the live pots are won` : ""}</span>
          </div>
        )}
        {settings.qr && challenges.some((c) => c.status === "open") && (
          <div className="overlay-qr">
            <div className="overlay-qr-code" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <span>Scan to add a bean</span>
          </div>
        )}
        {challenges.slice(0, settings.cards).map((c) => {
          const growth = growthOf(c.totalMicro, c.goalMicro);
          return (
            <div key={c.id} className="overlay-card">
              <Beanstalk stage={growth.index} size={64} />
              <div>
                <div className="overlay-title">{c.title}</div>
                <div className="overlay-bar">
                  <span style={{ width: `${growth.ratio * 100}%` }} />
                </div>
                <div className="overlay-meta">
                  <strong>{formatUsd(c.totalMicro)}</strong> in the pot
                  {c.status === "locked" ? " · attempt in progress" : " · pledge from the link in chat"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
