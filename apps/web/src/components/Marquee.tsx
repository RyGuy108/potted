"use client";

import { type ReactNode, useEffect, useRef } from "react";

/**
 * A row that drifts right to left on its own and can be dragged with the
 * mouse, swiped, or scrolled with a trackpad. `children` is one full set of
 * tiles; it is rendered twice so the loop has no seam, and the scroll
 * position wraps when the first set has gone by.
 */
export function Marquee({ children, label, pxPerSecond = 45 }: { children: ReactNode; label: string; pxPerSecond?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const firstSet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    const set = firstSet.current;
    if (!el || !set) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let paused = false;
    let drag: { x: number; left: number; moved: boolean } | null = null;
    let position = el.scrollLeft;
    let last = performance.now();
    let frame = 0;

    const wrap = () => {
      const width = set.offsetWidth;
      if (width === 0) return;
      if (el.scrollLeft >= width) el.scrollLeft -= width;
      else if (el.scrollLeft <= 0) el.scrollLeft += width;
    };

    const tick = (now: number) => {
      const elapsed = Math.min(64, now - last);
      last = now;
      if (!paused && !drag && !reduced) {
        // scrollLeft is rounded by browsers, so the fractional position is kept here.
        position = (Math.abs(el.scrollLeft - position) > 2 ? el.scrollLeft : position) + (pxPerSecond * elapsed) / 1000;
        el.scrollLeft = position;
        wrap();
        if (Math.abs(el.scrollLeft - position) > 2) position = el.scrollLeft;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const down = (e: PointerEvent) => {
      // Touch already scrolls natively; dragging is for the mouse.
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      drag = { x: e.clientX, left: el.scrollLeft, moved: false };
      el.setPointerCapture(e.pointerId);
      el.classList.add("dragging");
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 3) drag.moved = true;
      el.scrollLeft = drag.left - dx;
      const before = el.scrollLeft;
      wrap();
      // Keep the drag anchored after a wrap, so the tiles do not jump under the cursor.
      if (el.scrollLeft !== before) drag.left += el.scrollLeft - before;
    };
    const up = (e: PointerEvent) => {
      if (!drag) return;
      drag = null;
      position = el.scrollLeft;
      el.releasePointerCapture(e.pointerId);
      el.classList.remove("dragging");
    };
    const pause = () => (paused = true);
    const resume = () => {
      paused = false;
      position = el.scrollLeft;
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerenter", pause);
    el.addEventListener("pointerleave", resume);
    el.addEventListener("focusin", pause);
    el.addEventListener("focusout", resume);
    el.addEventListener("scroll", wrap, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("pointerenter", pause);
      el.removeEventListener("pointerleave", resume);
      el.removeEventListener("focusin", pause);
      el.removeEventListener("focusout", resume);
      el.removeEventListener("scroll", wrap);
    };
  }, [pxPerSecond]);

  return (
    <div className="marquee" ref={box} tabIndex={0} role="group" aria-label={label}>
      <div className="marquee-track">
        <div className="marquee-set" ref={firstSet}>
          {children}
        </div>
        <div className="marquee-set" aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  );
}
