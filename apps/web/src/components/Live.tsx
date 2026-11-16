"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { pollAction } from "@/app/actions";

/**
 * Keeps a page current while a challenge is live. When `pollIds` is given it
 * also asks the verifier to check those challenges (rate-limited server-side).
 */
export function AutoRefresh({ everyMs = 3000, pollIds = [] }: { everyMs?: number; pollIds?: string[] }) {
  const router = useRouter();
  const key = pollIds.join(",");
  useEffect(() => {
    const timer = setInterval(async () => {
      if (document.hidden) return;
      await Promise.all(key.split(",").filter(Boolean).map((id) => pollAction(id)));
      router.refresh();
    }, everyMs);
    return () => clearInterval(timer);
  }, [router, everyMs, key]);
  return null;
}

function remaining(ms: number): string {
  if (ms <= 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export function Countdown({ until }: { until: number }) {
  // Rendered empty on the server so the clock never mismatches on hydration.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <span className="mono">{now === null ? "–:––" : remaining(until - now)}</span>;
}

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const full = `${origin}${value}`;
  return (
    <div className="copy">
      <span className="label">{label}</span>
      <code>{full}</code>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={async () => {
          await navigator.clipboard.writeText(full);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
