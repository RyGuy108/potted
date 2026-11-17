"use client";

import { useState } from "react";
import type { Badge } from "@/lib/service";

const FIRST = 8;

/** Earned badges first; the rest of the set opens with "Show more". */
export function BadgeGrid({ badges }: { badges: Badge[] }) {
  const [open, setOpen] = useState(false);
  const ordered = [...badges.filter((b) => b.earned), ...badges.filter((b) => !b.earned)];
  const shown = open ? ordered : ordered.slice(0, FIRST);
  return (
    <>
      <div className="badges" id="badges">
        {shown.map((badge) => (
          <div key={badge.id} className={badge.earned ? "badge-tile badge-earned" : "badge-tile"} title={badge.how}>
            <span className="badge-dot" aria-hidden="true" />
            <span className="badge-text">
              <strong>{badge.name}</strong>
              <span className="muted">{badge.how}</span>
            </span>
            <span className="sr-only">{badge.earned ? "Earned" : "Locked"}</span>
          </div>
        ))}
      </div>
      {ordered.length > FIRST && (
        <button type="button" className="btn btn-ghost show-more" aria-expanded={open} aria-controls="badges" onClick={() => setOpen(!open)}>
          {open ? "Show fewer" : `Show ${ordered.length - FIRST} more`}
        </button>
      )}
    </>
  );
}
