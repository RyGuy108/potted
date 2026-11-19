"use client";

import TechText from "./TechText";

/** The big "Potted" on the front page: hover a letter to see its outline, drag it, or click to make the word ripple. */
export function Wordmark() {
  return (
    <div className="wordmark">
      <TechText
        text="Potted"
        fontWeight={600}
        fontSize={200}
        letterSpacing={-0.045}
        align="left"
        color="#faf7f2"
        accentColor="#e6c9a3"
        reveal="letter"
        dashLength={4}
        dashGap={3}
        specks={14}
        intro="metrics"
        introDuration={1.8}
        guides
        clickKick
      />
    </div>
  );
}
