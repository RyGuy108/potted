"use client";

import { useEffect, useRef, useState } from "react";
import BounceCards from "./BounceCards";

export interface Way {
  title: string;
  what: string;
  pays: string;
  otherwise: string;
  image: string;
  alt: string;
}

/** Size of the fan at full width; it shrinks in proportion on narrow screens. */
const FULL = { width: 620, height: 330, card: 230, spread: 190, push: 70 };

/**
 * The three kinds of money as a fan of cards, with each one's rules written out
 * underneath. Pointing at a card lights up its rules, and pointing at the rules
 * lifts its card, so the picture and the words always match.
 */
export function WaysToTakePart({ ways }: { ways: Way[] }) {
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
    <div className="ways-fan">
      <div ref={boxRef} className="ways-fan-stage" aria-hidden="true">
        <BounceCards
          images={ways.map((w) => ({ src: w.image, alt: w.alt }))}
          containerWidth={width}
          containerHeight={scaled(FULL.height)}
          cardSize={scaled(FULL.card)}
          spread={scaled(FULL.spread)}
          pushDistance={scaled(FULL.push)}
          rotation={8}
          arc={scaled(18)}
          hoverScale={1.06}
          bounciness={0.6}
          animationDelay={0.3}
          animationStagger={0.08}
          borderWidth={Math.max(3, scaled(5))}
          borderColor="#2a1e14"
          radius={Math.max(16, scaled(24))}
          shadow
          enableHover
          activeIndex={fromText}
          onActiveChange={setFromCards}
        />
      </div>
      <ol className="ways">
        {ways.map((way, i) => (
          <li
            key={way.title}
            className={`card way${active === i ? " way-active" : ""}`}
            onPointerEnter={() => setFromText(i)}
            onPointerLeave={() => setFromText(-1)}
          >
            <span className="way-no mono">0{i + 1}</span>
            <h3>{way.title}</h3>
            <p className="muted">{way.what}</p>
            <dl>
              <div>
                <dt>Pays</dt>
                <dd>{way.pays}</dd>
              </div>
              <div>
                <dt>Otherwise</dt>
                <dd>{way.otherwise}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ol>
    </div>
  );
}
