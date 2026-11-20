import Link from "next/link";
import type { ReactNode } from "react";

export interface PodiumEntry {
  id: string;
  name: string;
  avatarUrl?: string;
  /** Where the name links, if anywhere. */
  href?: string;
  /** Under the name, like a level or a game. */
  sub?: string;
  /** The big number. */
  value: ReactNode;
  /** Small lines under the number. */
  lines: string[];
  me?: boolean;
}

const PLACE = ["first", "second", "third"] as const;

/** A planter or climber's initial in a ringed circle, coloured by rank. */
export function RankAvatar({ name, src, rank, size = 64 }: { name: string; src?: string; rank?: number; size?: number }) {
  return (
    <span className={`rank-avatar${rank && rank <= 3 ? ` ring-${PLACE[rank - 1]}` : ""}`} style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">
      {src ? <img src={src} alt="" width={size} height={size} style={{borderRadius:"50%",objectFit:"cover"}} /> : name.charAt(0).toUpperCase()}
    </span>
  );
}

/** The top three on a stand: second on the left, first raised in the middle, third on the right. */
export function Podium({ entries }: { entries: PodiumEntry[] }) {
  const order = [entries[1], entries[0], entries[2]];
  return (
    <ol className="podium" aria-label="Top three">
      {order.map((e, i) => {
        if (!e) return <li key={`empty-${i}`} className="podium-spot empty" aria-hidden="true" />;
        const rank = i === 1 ? 1 : i === 0 ? 2 : 3;
        const name = e.href ? <Link href={e.href}>{e.name}</Link> : e.name;
        return (
          <li key={e.id} className={`podium-spot place-${PLACE[rank - 1]}${e.me ? " me" : ""}`} value={rank}>
            <RankAvatar src={e.avatarUrl} name={e.name} rank={rank} size={rank === 1 ? 104 : 84} />
            <strong className="podium-name">{name}</strong>
            {e.sub && <span className="podium-sub">{e.sub}</span>}
            <div className="podium-stand">
              <span className="medal">
                <span className="laurel" aria-hidden="true">
                  ❦
                </span>
                <span className="medal-disc">#{rank}</span>
                <span className="laurel flip" aria-hidden="true">
                  ❦
                </span>
              </span>
              <span className="podium-value mono">{e.value}</span>
              {e.lines.map((l) => (
                <span key={l} className="podium-line">
                  {l}
                </span>
              ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Ranked cards in a row, like a winners strip: a ringed avatar over each card, the first two in colour. */
export function WinnerStrip({ entries, tags }: { entries: (PodiumEntry & { rank: number })[]; tags: [string, string] }) {
  return (
    <ol className="winner-strip">
      {entries.map((e) => (
        <li key={e.id} className={`winner-card${e.rank === 1 ? " gold" : e.rank === 2 ? " green" : ""}${e.me ? " me" : ""}`} value={e.rank}>
          <span className="winner-avatar">
            <RankAvatar src={e.avatarUrl} name={e.name} rank={e.rank} size={76} />
          </span>
          <strong className="winner-name">{e.href ? <Link href={e.href}>{e.name}</Link> : e.name}</strong>
          <span className="winner-tag">{e.rank <= 2 ? tags[e.rank - 1] : `#${e.rank}`}</span>
          <span className="winner-value mono">{e.value}</span>
          {e.lines.map((l) => (
            <span key={l} className="winner-line">
              {l}
            </span>
          ))}
        </li>
      ))}
    </ol>
  );
}
