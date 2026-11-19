"use client";

import AccordionGallery from "./AccordionGallery";

const STEPS = [
  { image: "/how/ask.svg", label: "01 Ask · a fan suggests a challenge and can fund it", alt: "A fan asks in chat for a no-hit run and puts $12 on the request" },
  { image: "/how/answer.svg", label: "02 Answer · the streamer takes it on or passes", alt: "The streamer chooses Take it on or Pass; a pass refunds everyone" },
  { image: "/how/back.svg", label: "03 Back · it pays only if they pull it off", alt: "A beanstalk grows as fans back the attempt" },
  { image: "/how/live.svg", label: "04 Play it live · the game or a clip decides", alt: "The attempt is completed live and the pot is paid out" },
];

/** The four steps, as panels that open on hover or focus. */
export function HowItWorks() {
  return (
    <AccordionGallery
      items={STEPS}
      defaultIndex={0}
      accentColor="#e6c9a3"
      overlayColor="#0c0a08"
      textColor="#faf7f2"
      grayscale={false}
      height={440}
      gap={12}
      radius={18}
      expandRatio={0.56}
      tilt={6}
      className="how-gallery"
    />
  );
}
