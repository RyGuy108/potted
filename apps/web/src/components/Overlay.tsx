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
}

interface OverlaySettings {
  announcer: boolean;
  position: string;
  cards: number;
}

interface Feed {
  settings: OverlaySettings;
  seq: number;
  events: OverlayEvent[];
  challenges: OverlayChallenge[];
}

/** Plays the announcer line; falls back to the browser voice with no key. */
async function speak(event: OverlayEvent, muted: boolean): Promise<void> {
  if (muted) return;
  try {
    const res = await fetch(`/api/tts?seq=${event.seq}`);
    if (res.status === 200) {
      const audio = new Audio(URL.createObjectURL(await res.blob()));
      await audio.play();
      return;
    }
  } catch {
    // fall through to the browser voice
  }
  if ("speechSynthesis" in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(event.message));
}

const SPOKEN = new Set(["pledged", "locked", "paid", "failed", "claimed", "refunded"]);

export function Overlay({ handle, muted }: { handle: string; muted: boolean }) {
  const [challenges, setChallenges] = useState<OverlayChallenge[]>([]);
  const [toast, setToast] = useState<OverlayEvent | null>(null);
  const [settings, setSettings] = useState<OverlaySettings>({ announcer: true, position: "bottom-left", cards: 2 });
  // Read inside the timer callbacks, so a settings change applies without restarting the poll.
  const announcer = useRef(true);
  const since = useRef(-1);
  const queue = useRef<OverlayEvent[]>([]);
  const showing = useRef(false);

  useEffect(() => {
    function next() {
      const event = queue.current.shift();
      if (!event) {
        showing.current = false;
        setToast(null);
        return;
      }
      showing.current = true;
      setToast(event);
      if (SPOKEN.has(event.type)) void speak(event, muted || !announcer.current);
      setTimeout(next, 4000);
    }

    async function poll() {
      try {
        const res = await fetch(`/api/events?handle=${encodeURIComponent(handle)}&since=${since.current}`, { cache: "no-store" });
        if (!res.ok) return;
        const feed = (await res.json()) as Feed;
        since.current = feed.seq;
        announcer.current = feed.settings.announcer;
        setSettings(feed.settings);
        setChallenges(feed.challenges);
        if (feed.events.length > 0) {
          queue.current.push(...feed.events);
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
        <div key={toast.seq} className={`overlay-toast overlay-${toast.type}`}>
          {toast.message}
        </div>
      )}
      <div className="overlay-stack">
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
