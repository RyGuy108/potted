/**
 * The mascot: a beanstalk. Every pledge is a magic bean, and the stalk
 * climbs through five stages as the pot fills, until it reaches the clouds.
 */

const STALK = "#2fa36b";
const STALK_DARK = "#1c7a4d";
const LEAF = "#46c487";
const GROUND_Y = 128;
/** How high the stalk reaches at each stage (smaller is taller). */
const TOPS = [GROUND_Y, 104, 80, 54, 24];
const STEP = 22;
const SWAY = 14;

interface Bend {
  y: number;
  dir: 1 | -1;
}

/** A winding path up from the ground, plus where each bend bulges out. */
function climb(top: number): { d: string; bends: Bend[] } {
  let d = `M60 ${GROUND_Y}`;
  const bends: Bend[] = [];
  let y = GROUND_Y;
  for (let i = 0; y > top; i++) {
    const next = Math.max(top, y - STEP);
    const dir = i % 2 === 0 ? 1 : -1;
    d += ` Q ${60 + dir * SWAY} ${(y + next) / 2} 60 ${next}`;
    bends.push({ y: (y + next) / 2, dir });
    y = next;
  }
  return { d, bends };
}

function Leaf({ bend, size }: { bend: Bend; size: number }) {
  const x = 60 + (bend.dir * SWAY) / 2;
  return (
    <path
      d={`M0 0 C ${size * 0.5} ${-size * 0.55}, ${size} ${-size * 0.35}, ${size * 1.15} 0 C ${size} ${size * 0.4}, ${size * 0.45} ${size * 0.45}, 0 0 Z`}
      fill={LEAF}
      transform={`translate(${x} ${bend.y}) rotate(${bend.dir === 1 ? -18 : 198})`}
    />
  );
}

export function Beanstalk({ stage, size = 96, label }: { stage: number; size?: number; label?: string }) {
  const s = Math.max(0, Math.min(4, Math.round(stage)));
  const top = TOPS[s]!;
  const { d, bends } = climb(top);
  return (
    <svg
      width={size}
      height={(size * 140) / 120}
      viewBox="0 0 120 140"
      role="img"
      aria-label={label ?? `Beanstalk, growth stage ${s + 1} of 5`}
    >
      {s >= 1 && (
        <>
          {s >= 3 && (
            <path
              d={climb(top + 10).d}
              stroke={STALK_DARK}
              strokeWidth="2.2"
              strokeLinecap="round"
              fill="none"
              transform="translate(120 0) scale(-1 1)"
            />
          )}
          <path d={d} stroke={STALK} strokeWidth={[0, 3, 4, 5, 5.5][s]} strokeLinecap="round" fill="none" />
          {bends.map((bend) => (
            <Leaf key={bend.y} bend={bend} size={[0, 11, 14, 15, 16][s]!} />
          ))}
          {/* the curling tip */}
          <path
            d={`M60 ${top} q 7 -7 1 -11 q -5 -2 -5 3`}
            stroke={STALK}
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
        </>
      )}
      {s === 4 && (
        <>
          <g fill="#e9eef7">
            <ellipse cx="46" cy="18" rx="17" ry="9" />
            <ellipse cx="68" cy="14" rx="20" ry="11" />
            <ellipse cx="84" cy="21" rx="13" ry="7" />
          </g>
          <g fill="#e9bb4d" stroke="#b98a1e" strokeWidth="0.8">
            <ellipse cx="36" cy="64" rx="4" ry="3" transform="rotate(-25 36 64)" />
            <ellipse cx="86" cy="86" rx="4" ry="3" transform="rotate(20 86 86)" />
            <ellipse cx="84" cy="44" rx="4" ry="3" transform="rotate(-15 84 44)" />
          </g>
        </>
      )}
      <path d={`M26 ${GROUND_Y + 6} Q 60 ${GROUND_Y - 12} 94 ${GROUND_Y + 6} Z`} fill="#4d3b2b" />
      <path d={`M36 ${GROUND_Y + 1} Q 60 ${GROUND_Y - 9} 84 ${GROUND_Y + 1}`} stroke="#6a523b" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {s === 0 && (
        <g>
          <ellipse cx="60" cy={GROUND_Y - 8} rx="7" ry="4.6" fill="#e9bb4d" stroke="#b98a1e" strokeWidth="1" transform={`rotate(-20 60 ${GROUND_Y - 8})`} />
          <path d={`M72 ${GROUND_Y - 22} v6 M69 ${GROUND_Y - 19} h6`} stroke="#e9bb4d" strokeWidth="1.4" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
