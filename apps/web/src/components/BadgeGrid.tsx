"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Badge } from "@/lib/service";

const FIRST = 8;

/** Earned badges first; the rest of the set opens with "Show more". Each badge opens a lightbox that says how to earn it. */
export function BadgeGrid({ badges }: { badges: Badge[] }) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<Badge | null>(null);
  const ordered = [...badges.filter((b) => b.earned), ...badges.filter((b) => !b.earned)];
  const shown = open ? ordered : ordered.slice(0, FIRST);
  return (
    <>
      <div className="badges" id="badges">
        {shown.map((badge) => (
          <button
            type="button"
            key={badge.id}
            className={badge.earned ? "badge-tile badge-earned" : "badge-tile"}
            onClick={() => setFocus(badge)}
            aria-haspopup="dialog"
          >
            <span className="badge-dot" aria-hidden="true" />
            <strong className="badge-name">{badge.name}</strong>
            <span className="sr-only">{badge.earned ? "Earned" : "Locked"}</span>
          </button>
        ))}
      </div>
      {ordered.length > FIRST && (
        <button type="button" className="btn btn-ghost show-more" aria-expanded={open} aria-controls="badges" onClick={() => setOpen(!open)}>
          {open ? "Show fewer" : `Show ${ordered.length - FIRST} more`}
        </button>
      )}
      {focus && <BadgeLightbox badge={focus} onClose={() => setFocus(null)} />}
    </>
  );
}

function BadgeLightbox({ badge, onClose }: { badge: Badge; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      before?.focus();
    };
  }, [onClose]);
  return createPortal(
    <div className="lightbox" onClick={onClose}>
      <div className={`lightbox-card${badge.earned ? " earned" : ""}`} role="dialog" aria-modal="true" aria-labelledby="badge-title" onClick={(e) => e.stopPropagation()}>
        <span className="lightbox-medal" aria-hidden="true" />
        <p className="eyebrow">{badge.earned ? "Earned" : "Not yet"}</p>
        <h3 id="badge-title">{badge.name}</h3>
        <p className="muted">{badge.how}</p>
        <button ref={closeRef} type="button" className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>,
    document.body,
  );
}
