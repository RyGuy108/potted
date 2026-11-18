"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Motion in the spirit of Apple's: things ease out and settle rather than
 * bounce, numbers run up to their value, rings fill. Everything starts when
 * it scrolls into view and is skipped for people who ask for reduced motion.
 */

const EASE_OUT = (t: number) => 1 - Math.pow(1 - t, 4);
/** Gentler for money trickling into a pot: keeps moving for longer before it settles. */
const EASE_TRICKLE = (t: number) => 1 - Math.pow(1 - t, 2.2);

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Fires once, when the element first shows on screen. */
function useInView<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") return setSeen(true);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

type Format = "usd" | "int" | "pct";

function show(value: number, format: Format): string {
  if (format === "usd") return `$${value.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })}`;
  if (format === "pct") return `${Math.round(value)}%`;
  return Math.round(value).toLocaleString("en-US");
}

/**
 * A number that runs up to its value. Money is given in micro-units like the
 * rest of the app and shown in dollars. When the value changes later (a new
 * pledge), it runs from the old value to the new one.
 */
export function CountUp({
  value,
  format = "int",
  micro = false,
  duration = 1100,
  trickle = false,
  className,
}: {
  value: number;
  format?: Format;
  micro?: boolean;
  duration?: number;
  /** A slower, steadier run, for money landing in a pot. */
  trickle?: boolean;
  className?: string;
}) {
  const target = micro ? value / 1_000_000 : value;
  const [ref, seen] = useInView<HTMLSpanElement>();
  const [shown, setShown] = useState<number | null>(null);
  const from = useRef(0);
  useEffect(() => {
    if (!seen) return;
    if (reducedMotion()) return setShown(target);
    const start = performance.now();
    const begin = from.current;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = begin + (target - begin) * (trickle ? EASE_TRICKLE(t) : EASE_OUT(t));
      // Money settles on whole cents; counts on whole numbers.
      setShown(format === "usd" ? Math.round(v * 100) / 100 : v);
      if (t < 1) frame = requestAnimationFrame(step);
      else from.current = target;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [seen, target, duration, format, trickle]);
  return (
    <span ref={ref} className={`count-up${className ? ` ${className}` : ""}`}>
      {/* Before it runs, the real value is there for screen readers and no-JS. */}
      {shown === null ? (seen ? show(0, format) : show(target, format)) : show(shown, format)}
    </span>
  );
}

/** A circular gauge that fills to `pct`, with whatever goes in its centre. */
export function Ring({ pct, size = 120, stroke = 10, tone = "green", children, label }: { pct: number; size?: number; stroke?: number; tone?: "green" | "blue" | "gold" | "violet"; children?: React.ReactNode; label: string }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const done = clamped >= 100;
  return (
    <div ref={ref} className={`ring ring-${tone}${seen ? " ring-in" : ""}${done ? " ring-done" : ""}`} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle
          className="ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{ strokeDashoffset: seen ? circumference * (1 - clamped / 100) : circumference }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-centre">{children}</div>
    </div>
  );
}

/** A progress bar that grows to its value when it comes into view. */
export function GrowBar({ pct, className = "bar", label, duration = 1300 }: { pct: number; className?: string; label?: string; /** How long the fill takes, in ms. */ duration?: number }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div ref={ref} className={`${className} grow-bar`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clamped)} aria-label={label}>
      <span style={{ width: seen ? `${clamped}%` : "0%", transitionDuration: `${duration}ms` }} />
    </div>
  );
}

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789$#%&*+";

/**
 * Text that shuffles through random characters and settles, left to right,
 * on what it says. The real text is rendered first, for screen readers and
 * search; the shuffle only plays once it scrolls into view.
 */
export function Scramble({ text, duration = 1000, className }: { text: string; duration?: number; className?: string }) {
  const [ref, seen] = useInView<HTMLSpanElement>();
  const [shown, setShown] = useState(text);
  useEffect(() => {
    if (!seen || reducedMotion()) return setShown(text);
    const chars = [...text];
    const start = performance.now();
    let last = 0;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // About 30 changes a second: fast enough to read as a shuffle, not a flicker.
      if (now - last > 33 || t === 1) {
        last = now;
        // Every letter shuffles for the first 40%; then they settle left to right, evenly.
        const settled = t < 0.4 ? 0 : Math.floor(((t - 0.4) / 0.6) * chars.length);
        setShown(chars.map((ch, i) => (i < settled || ch === " " ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)])).join(""));
      }
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [seen, text, duration]);
  return (
    <span ref={ref} className={`scramble${className ? ` ${className}` : ""}`} aria-label={text}>
      <span aria-hidden="true">{shown}</span>
    </span>
  );
}
