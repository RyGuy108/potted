"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import CircularCarousel from "./CircularCarousel";

export interface CarouselStream {
  handle: string;
  /** The card image, with a version so it refreshes when the pot changes. */
  src: string;
  title: string;
  streamer: string;
  game: string;
  pot: string;
  planters: number;
  status: "open" | "locked";
  reason?: string;
}

/**
 * Live streams on a turning ring. The card in front is named underneath,
 * with a link to it; clicking the front card opens the stream, clicking
 * another turns it to the front. A plain list of links is there for screen
 * readers and keyboards.
 */
export function LiveCarousel({ streams, label, ranked = false }: { streams: CarouselStream[]; label: string; ranked?: boolean }) {
  const router = useRouter();
  const [active, setActive] = useState(0);
  const front = streams[active] ?? streams[0]!;
  return (
    <div className="live-carousel">
      <div className="live-carousel-ring">
        <CircularCarousel
          items={streams.map((s) => ({ src: s.src, alt: `${s.streamer}: ${s.title}`, title: s.title, subtitle: s.streamer }))}
          preset="cylinder"
          intro="rise"
          cardWidth={340}
          aspectRatio={1.5}
          gap={22}
          speed={9}
          tilt={-6}
          depthFade={0.7}
          fadeColor="#0c0a08"
          innerShade={0.75}
          cornerRadius={14}
          onChange={setActive}
          onItemClick={(_item, index) => {
            if (index === active) router.push(`/s/${streams[index]!.handle}`);
          }}
        />
      </div>
      <div className="live-carousel-caption" aria-live="polite">
        <div className="live-carousel-text">
          <p className="live-carousel-meta">
            {ranked && <span className="rank-badge static">#{active + 1}</span>}
            <span>{front.streamer}</span>
            <span className="muted">· {front.game}</span>
            <span className="muted">
              · {front.pot} · {front.planters} {front.planters === 1 ? "planter" : "planters"}
            </span>
          </p>
          <strong key={active} className="live-carousel-title">{front.title}</strong>
          {front.reason && <span className="stream-reason">{front.reason}</span>}
        </div>
        <Link href={`/s/${front.handle}`} className="btn btn-primary">
          {front.status === "locked" ? "Watch the attempt" : "Watch and back"}
        </Link>
      </div>
      <ul className="sr-only" aria-label={label}>
        {streams.map((s, i) => (
          <li key={s.handle}>
            <Link href={`/s/${s.handle}`}>
              {ranked ? `#${i + 1} ` : ""}
              {s.streamer}: {s.title}, {s.pot} in the pot
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
