"use client";

import MagicBento, { type MagicBentoItem } from "./MagicBento";

/** The account page's grid of tiles, each leading somewhere. Styled in Potted's warm dark theme. */
export function AccountBento({ items }: { items: MagicBentoItem[] }) {
  return (
    <MagicBento
      items={items}
      columns={4}
      rowHeight={190}
      gap={14}
      radius={20}
      glowColor="#e6c9a3"
      enableBorderGlow
      enableSpotlight
      spotlightRadius={320}
      enableStars
      particleCount={18}
      clickEffect
      className="account-bento"
      style={
        {
          "--mb-surface": "linear-gradient(180deg, #1b1713 0%, #120f0c 100%)",
          "--mb-edge": "rgba(255, 238, 214, 0.08)",
          "--mb-ink": "#faf7f2",
          "--mb-muted": "rgba(250, 247, 242, 0.62)",
          "--mb-line": "rgba(250, 247, 242, 0.1)",
        } as React.CSSProperties
      }
    />
  );
}
