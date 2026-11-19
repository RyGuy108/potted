"use client";

import AccordionGallery from "./AccordionGallery";

const STEPS = [
  { step: 1, word: "Ask", image: "/how/ask.svg", detail: "A fan suggests a challenge and can fund it", alt: "A fan asks in chat for a no-hit run and puts $12 on the request" },
  { step: 2, word: "Answer", image: "/how/answer.svg", detail: "The streamer takes it on or passes", alt: "The streamer chooses Take it on or Pass; a pass refunds everyone" },
  { step: 3, word: "Back", image: "/how/back.svg", detail: "Fans back it, paid only if they pull it off", alt: "A beanstalk grows as fans back the attempt" },
  { step: 4, word: "Play", image: "/how/live.svg", detail: "Played live; the game or a clip decides", alt: "The attempt is completed live and the pot is paid out" },
].map((s) => ({ ...s, label: `Step ${s.step}, ${s.word}: ${s.detail}` }));

/** The four steps: a numbered word on each panel, the full line once a panel opens. */
export function HowItWorks() {
  return (
    <AccordionGallery
      items={STEPS}
      defaultIndex={0}
      accentColor="#e6c9a3"
      overlayColor="#0c0a08"
      textColor="#faf7f2"
      grayscale={false}
      blurInactive
      height={440}
      gap={12}
      radius={18}
      expandRatio={0.56}
      tilt={0}
      parallax={0}
      className="how-gallery"
    />
  );
}
