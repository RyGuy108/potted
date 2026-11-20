"use client";

import { useEffect, useRef, useState } from "react";
import BounceCards from "./BounceCards";
import { type Tech, TechTag } from "./TechTag";
import "./BuiltOn.css";

export interface Part {
  tech: Tech;
  name: string;
  text: string;
  image: string;
  alt: string;
}

/** Size of the fan at full width; it shrinks in proportion on narrow screens. */
const FULL = { width: 680, height: 300, card: 200, spread: 152, push: 56 };

/**
 * The stack as a fan of cards, one per sponsor, with what each one does
 * written out underneath. Like the three ways to take part: pointing at a
 * card lights up its text, and pointing at the text lifts its card.
 */
export function BuiltOn({ parts }: { parts: Part[] }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FULL.width);
  const [fromCards, setFromCards] = useState(-1);
  const [fromText, setFromText] = useState(-1);
  const active = fromCards >= 0 ? fromCards : fromText;

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const measure = () => setWidth(Math.min(FULL.width, Math.floor(box.clientWidth)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const k = width / FULL.width;
  const scaled = (n: number) => Math.round(n * k);

  return (
    <div className="built-fan">
      <div ref={boxRef} className="ways-fan-stage" aria-hidden="true">
        <BounceCards
          images={parts.map((p) => ({ src: p.image, alt: p.alt }))}
          containerWidth={width}
          containerHeight={scaled(FULL.height)}
          cardSize={scaled(FULL.card)}
          spread={scaled(FULL.spread)}
          pushDistance={scaled(FULL.push)}
          rotation={7}
          arc={scaled(16)}
          hoverScale={1.06}
          bounciness={0.6}
          animationDelay={0.3}
          animationStagger={0.07}
          borderWidth={Math.max(3, scaled(5))}
          borderColor="#2a1e14"
          radius={Math.max(14, scaled(22))}
          shadow
          enableHover
          activeIndex={fromText}
          onActiveChange={setFromCards}
        />
      </div>
      <ul className="built-parts">
        {parts.map((part, i) => (
          <li
            key={part.tech}
            className={`card built-part built-${part.tech}${active === i ? " built-part-active" : ""}`}
            onPointerEnter={() => setFromText(i)}
            onPointerLeave={() => setFromText(-1)}
          >
            <TechTag tech={part.tech}>{part.name}</TechTag>
            <p className="muted small">{part.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
