"use client";

import { useEffect, useState } from "react";

/**
 * Post on X, copy the link, or save the card. `path` and `card` are paths on
 * this site; the full address is taken from the page, so links work on any host.
 */
export function ShareButtons({ path, text, card, cardName = "potted-card.png" }: { path: string; text: string; card?: string; cardName?: string }) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}${path}`;
  const post = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  return (
    <div className="share-buttons row">
      <a className="btn btn-primary" href={post} target="_blank" rel="noreferrer">
        Post on X
      </a>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Link copied" : "Copy link"}
      </button>
      {card && (
        <a className="btn btn-ghost" href={card} download={cardName}>
          Save the card
        </a>
      )}
    </div>
  );
}
