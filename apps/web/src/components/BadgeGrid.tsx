"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { mintBadgesAction } from "@/app/actions";
import type { Badge } from "@/lib/service";

const FIRST = 8;

/** Earned badges first; the rest of the set opens with "Show more". Each badge opens a lightbox that says how to earn it. */
export function BadgeGrid({
  badges,
  onChain = {},
  canMint = false,
}: {
  badges: Badge[];
  /** Badges already in the planter's wallet as tokens, with the explorer link for each. */
  onChain?: Record<string, string>;
  /** Whether badges can go on Solana here (the Solana ledger is on). */
  canMint?: boolean;
}) {
  const router = useRouter();
  const [minting, startMint] = useTransition();
  const [mintError, setMintError] = useState<string | null>(null);
  const waiting = badges.filter((b) => b.earned && !onChain[b.id]).length;
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<Badge | null>(null);
  const ordered = [...badges.filter((b) => b.earned), ...badges.filter((b) => !b.earned)];
  const shown = open ? ordered : ordered.slice(0, FIRST);
  return (
    <>
      {canMint && waiting > 0 && (
        <div className="badge-mint">
          <span className="muted small">Your badges can live in your Solana wallet as soulbound tokens: yours to show, never for sale.</span>
          <button
            type="button"
            className="btn btn-primary"
            disabled={minting}
            onClick={() =>
              startMint(async () => {
                setMintError(null);
                const result = await mintBadgesAction();
                if (!result.ok) setMintError(result.error);
                router.refresh();
              })
            }
          >
            {minting ? "Putting them on Solana…" : `Put ${waiting} ${waiting === 1 ? "badge" : "badges"} on Solana`}
          </button>
          {mintError && <span className="error small">{mintError}</span>}
        </div>
      )}
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
            {onChain[badge.id] && (
              <span className="badge-chain" title="In your wallet on Solana">
                ◎
              </span>
            )}
            <span className="sr-only">{badge.earned ? "Earned" : "Locked"}</span>
          </button>
        ))}
      </div>
      {ordered.length > FIRST && (
        <button type="button" className="btn btn-ghost show-more" aria-expanded={open} aria-controls="badges" onClick={() => setOpen(!open)}>
          {open ? "Show fewer" : `Show ${ordered.length - FIRST} more`}
        </button>
      )}
      {focus && <BadgeLightbox badge={focus} explorer={onChain[focus.id]} onClose={() => setFocus(null)} />}
    </>
  );
}

function BadgeLightbox({ badge, explorer, onClose }: { badge: Badge; explorer?: string; onClose: () => void }) {
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
        {explorer && (
          <a className="badge-onchain" href={explorer} target="_blank" rel="noreferrer">
            ◎ In your wallet on Solana · view the token
          </a>
        )}
        <button ref={closeRef} type="button" className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>,
    document.body,
  );
}
