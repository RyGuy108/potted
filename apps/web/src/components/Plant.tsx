/**
 * The mascot: a money tree in a terracotta pot. It grows through five
 * stages as the pot fills (seed, sprout, sapling, tree, bloom).
 */

const LEAF = "#2e9e6b";
const LEAF_DARK = "#1f7d52";
const TRUNK = "#8a6842";

function Leaf({ x, y, angle, length, dark }: { x: number; y: number; angle: number; length: number; dark?: boolean }) {
  return (
    <ellipse
      cx={x}
      cy={y - length / 2}
      rx={length / 4.2}
      ry={length / 2}
      fill={dark ? LEAF_DARK : LEAF}
      transform={`rotate(${angle} ${x} ${y})`}
    />
  );
}

function Fan({ x, y, count, spread, length }: { x: number; y: number; count: number; spread: number; length: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const angle = count === 1 ? 0 : -spread + (2 * spread * i) / (count - 1);
        return <Leaf key={i} x={x} y={y} angle={angle} length={length} dark={i % 2 === 1} />;
      })}
    </>
  );
}

export function Plant({ stage, size = 96, label }: { stage: number; size?: number; label?: string }) {
  const s = Math.max(0, Math.min(4, Math.round(stage)));
  const stemTop = [96, 82, 66, 50, 46][s]!;
  return (
    <svg
      width={size}
      height={(size * 140) / 120}
      viewBox="0 0 120 140"
      role="img"
      aria-label={label ?? `Money tree, growth stage ${s + 1} of 5`}
    >
      {s >= 1 && (
        <path
          d={`M60 96 C ${s >= 3 ? 57 : 60} 84, ${s >= 3 ? 63 : 60} ${stemTop + 12}, 60 ${stemTop}`}
          stroke={s >= 3 ? TRUNK : LEAF_DARK}
          strokeWidth={[0, 2.5, 3.5, 6, 6.5][s]}
          strokeLinecap="round"
          fill="none"
        />
      )}
      {s >= 3 && (
        <g stroke="#6f5233" strokeWidth="1" strokeLinecap="round">
          <path d="M57.5 90 l5 -5 M57.5 80 l5 -5 M57.5 70 l5 -5 M57.5 60 l5 -5" />
        </g>
      )}
      {s === 1 && <Fan x={60} y={stemTop} count={2} spread={42} length={13} />}
      {s === 2 && <Fan x={60} y={stemTop} count={4} spread={66} length={19} />}
      {s >= 3 && (
        <>
          <path d="M60 74 L42 62 M60 70 L78 58" stroke={TRUNK} strokeWidth="2.5" strokeLinecap="round" />
          <Fan x={42} y={62} count={3} spread={50} length={s === 4 ? 19 : 16} />
          <Fan x={78} y={58} count={3} spread={50} length={s === 4 ? 19 : 16} />
          <Fan x={60} y={stemTop} count={5} spread={72} length={s === 4 ? 26 : 22} />
        </>
      )}
      {s === 4 && (
        <g fill="#e0b13a" stroke="#b98a1e" strokeWidth="0.8">
          <circle cx="38" cy="38" r="4" />
          <circle cx="84" cy="34" r="4" />
          <circle cx="60" cy="16" r="4.5" />
        </g>
      )}
      <ellipse cx="60" cy="97" rx="21" ry="3.5" fill="#4b3a2c" />
      {s === 0 && <ellipse cx="60" cy="95.5" rx="4" ry="2.5" fill="#7a5c3c" />}
      <path d="M37 100 h46 l-5 31 a4 4 0 0 1 -4 3.5 h-28 a4 4 0 0 1 -4 -3.5 z" fill="#c8694a" />
      <rect x="33" y="94" width="54" height="10" rx="3.5" fill="#b65a3c" />
      <path d="M44 110 l2.5 18" stroke="#d98667" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}
