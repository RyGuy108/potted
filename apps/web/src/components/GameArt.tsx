import fs from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";

const VIDEO = ["mp4", "webm"];
const IMAGE = ["webp", "jpg", "jpeg", "png"];

/** A clip or image the streamer dropped into public/games, if there is one for this game. */
function customMedia(id: string): { kind: "video" | "image"; src: string } | undefined {
  const dir = path.join(process.cwd(), "public", "games");
  for (const [kind, extensions] of [["video", VIDEO], ["image", IMAGE]] as const) {
    for (const ext of extensions) {
      if (fs.existsSync(path.join(dir, `${id}.${ext}`))) return { kind, src: `/games/${id}.${ext}` };
    }
  }
  return undefined;
}

const G = "#35c98b";
const B = "#3a3a3a";
const L = "#d4d4d4";
const Y = "#e9bb4d";
const W = "#eef3fb";
const line = { fill: "none", strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/**
 * Original illustrations, one per stream type. They suggest the activity
 * without using any game's own artwork, logos or characters.
 */
const ART: Record<string, ReactNode> = {
  chess: (
    <g>
      {[0, 1, 2, 3, 4, 5, 6, 7].flatMap((c) => [0, 1, 2].map((r) => ((c + r) % 2 === 0 ? <rect key={`${c}${r}`} x={90 + c * 30} y={60 + r * 30} width="30" height="30" fill={B} opacity="0.35" /> : null)))}
      <rect x="90" y="60" width="240" height="90" {...line} stroke={L} opacity="0.5" />
      <circle cx="195" cy="62" r="13" fill={W} />
      <path d="M183 112 q12 -34 24 0 z M177 122 h36 v8 h-36 z" fill={W} />
      <circle cx="255" cy="92" r="10" fill={G} />
      <path d="M246 126 q9 -26 18 0 z M241 134 h28 v7 h-28 z" fill={G} />
    </g>
  ),
  brawlstars: (
    <g>
      <rect x="70" y="40" width="280" height="110" rx="14" {...line} stroke={L} opacity="0.45" />
      <path d="M210 40 v110" {...line} stroke={L} opacity="0.3" strokeDasharray="6 8" />
      {[70, 95, 120].map((y, i) => <circle key={y} cx={120 + (i % 2) * 28} cy={y} r="11" fill={B} />)}
      {[70, 95, 120].map((y, i) => <circle key={y} cx={300 - (i % 2) * 28} cy={y} r="11" fill="#ef6b6b" />)}
      <path d="M210 72 l7 15 16 2 -12 11 3 16 -14 -8 -14 8 3 -16 -12 -11 16 -2 z" fill={Y} />
    </g>
  ),
  fortnite: (
    <g>
      <path d="M60 150 q60 -70 130 -40 q50 -50 110 -10 q40 10 60 50 z" fill={G} opacity="0.3" />
      <circle cx="215" cy="105" r="62" {...line} stroke={L} opacity="0.35" />
      <circle cx="225" cy="110" r="36" {...line} stroke={W} strokeDasharray="5 7" />
      <path d="M150 44 q22 -22 44 0 z" fill={Y} />
      <path d="M152 44 l20 26 20 -26" {...line} stroke={Y} strokeWidth="2" />
      <circle cx="172" cy="74" r="5" fill={W} />
    </g>
  ),
  steam: (
    <g>
      <path d="M180 48 h60 v26 a30 30 0 0 1 -60 0 z" fill={Y} />
      <path d="M180 56 h-18 a18 18 0 0 0 18 26 M240 56 h18 a18 18 0 0 1 -18 26" {...line} stroke={Y} />
      <path d="M204 104 h12 v16 h14 v9 h-40 v-9 h14 z" fill={Y} />
      <path d="M118 70 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4 z M300 96 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 z" fill={W} />
      <rect x="150" y="140" width="120" height="8" rx="4" fill={B} opacity="0.5" />
      <rect x="150" y="140" width="84" height="8" rx="4" fill={G} />
    </g>
  ),
  gta6: (
    <g>
      <circle cx="210" cy="118" r="46" fill={Y} opacity="0.85" />
      <path d="M40 150 v-34 h26 v-22 h22 v40 h18 v-58 h26 v74 z M300 150 v-66 h24 v30 h20 v-44 h22 v80 z" fill="#0f0f0f" stroke={L} strokeWidth="1.5" opacity="0.95" />
      <path d="M170 150 l28 -32 h24 l28 32 z" fill="#202020" />
      <path d="M210 150 v-8 M210 134 v-6 M210 124 v-4" {...line} stroke={W} strokeWidth="2" />
      <path d="M262 150 v-52 M262 98 q-18 -10 -26 2 M262 98 q18 -10 26 2 M262 98 q-6 -18 -20 -14 M262 98 q6 -18 20 -14" {...line} stroke={G} />
    </g>
  ),
  speedrun: (
    <g>
      <circle cx="230" cy="104" r="42" {...line} stroke={W} />
      <path d="M222 54 h16 M230 54 v8 M230 104 l18 -20" {...line} stroke={W} />
      <path d="M230 104 l18 -20" {...line} stroke={G} strokeWidth="4" />
      <path d="M90 84 h64 M70 104 h78 M100 124 h52" {...line} stroke={L} opacity="0.6" />
      <text x="300" y="150" fontFamily="monospace" fontSize="16" fill={G}>-0:03.2</text>
    </g>
  ),
  minecraft: (
    <g>
      {[[150, 110], [200, 110], [250, 110], [175, 82], [225, 82], [200, 54]].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <path d={`M${x} ${y} l25 -13 25 13 -25 13 z`} fill={L} />
          <path d={`M${x} ${y} v26 l25 13 v-26 z`} fill={B} />
          <path d={`M${x! + 50} ${y} v26 l-25 13 v-26 z`} fill="#2c2c2c" />
        </g>
      ))}
    </g>
  ),
  fitness: (
    <g>
      <path d="M50 150 q160 -90 320 0 M50 128 q160 -84 320 0 M50 106 q160 -78 320 0" {...line} stroke={L} opacity="0.35" />
      <path d="M80 86 h60 l14 -26 18 52 16 -40 12 14 h130" {...line} stroke={G} strokeWidth="4" />
      <circle cx="330" cy="86" r="6" fill={G} />
      <text x="84" y="50" fontFamily="monospace" fontSize="15" fill={W}>5.0 km</text>
    </g>
  ),
  cooking: (
    <g>
      <ellipse cx="200" cy="112" rx="62" ry="16" fill="#202020" stroke={W} strokeWidth="3" />
      <path d="M262 112 h70" {...line} stroke={W} strokeWidth="6" />
      <circle cx="186" cy="110" r="9" fill={Y} />
      <circle cx="214" cy="114" r="7" fill="#ef6b6b" />
      <path d="M170 86 q-10 -14 0 -26 q10 -12 0 -24 M200 84 q-10 -14 0 -26 q10 -12 0 -24 M230 86 q-10 -14 0 -26 q10 -12 0 -24" {...line} stroke={L} opacity="0.55" />
      <path d="M176 150 q8 -14 0 -20 q14 4 12 20 z M214 150 q8 -14 0 -20 q14 4 12 20 z" fill={Y} />
    </g>
  ),
  music: (
    <g>
      {[30, 54, 78, 46, 92, 60, 100, 70, 40, 84, 56, 34, 66, 44].map((h, i) => (
        <rect key={i} x={82 + i * 19} y={104 - h / 2} width="10" height={h} rx="5" fill={i % 3 === 0 ? G : B} opacity={i % 3 === 0 ? 1 : 0.75} />
      ))}
      <path d="M330 60 v44 M330 60 l22 -8 v12 l-22 8" {...line} stroke={W} />
      <ellipse cx="322" cy="106" rx="9" ry="7" fill={W} />
    </g>
  ),
  art: (
    <g>
      <rect x="130" y="42" width="150" height="104" rx="6" fill="#202020" stroke={W} strokeWidth="3" />
      <path d="M146 122 q30 -50 56 -20 q22 26 60 -34" {...line} stroke={G} strokeWidth="7" />
      <path d="M150 70 q26 14 50 -4" {...line} stroke={Y} strokeWidth="6" />
      <path d="M300 136 l42 -64" {...line} stroke={W} strokeWidth="5" />
      <path d="M336 78 l12 -18 8 6 -12 18 z" fill={B} />
    </g>
  ),
  study: (
    <g>
      <rect x="130" y="44" width="160" height="96" rx="8" fill="#202020" stroke={W} strokeWidth="3" />
      <path d="M110 150 h200" {...line} stroke={W} strokeWidth="5" />
      <path d="M150 68 h44 M150 86 h78 M166 104 h54 M150 122 h36" {...line} stroke={L} />
      <path d="M204 68 h30 M228 104 h24" {...line} stroke={G} />
      <circle cx="262" cy="122" r="4" fill={Y} />
    </g>
  ),
  other: (
    <g>
      <rect x="120" y="44" width="180" height="104" rx="12" fill="#202020" stroke={W} strokeWidth="3" />
      <path d="M196 76 v40 l34 -20 z" fill={G} />
      <rect x="136" y="132" width="148" height="5" rx="2.5" fill={B} opacity="0.5" />
      <rect x="136" y="132" width="60" height="5" rx="2.5" fill={G} />
      <circle cx="324" cy="60" r="7" fill="#ef6b6b" />
    </g>
  ),
};

/** The picture at the top of a game's tile. */
export function GameArt({ id, name }: { id: string; name: string }) {
  const media = customMedia(id);
  if (media?.kind === "video") {
    return <video className="game-art" src={media.src} muted loop autoPlay playsInline preload="metadata" aria-label={`${name} clip`} />;
  }
  if (media?.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="game-art" src={media.src} alt={`${name} stream`} draggable={false} />;
  }
  return (
    <svg className="game-art" viewBox="0 0 420 180" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`${name} illustration`}>
      <rect width="420" height="180" fill="#151515" />
      <circle cx="340" cy="20" r="120" fill={B} opacity="0.16" />
      <circle cx="60" cy="180" r="100" fill={G} opacity="0.1" />
      {ART[id] ?? ART.other}
    </svg>
  );
}
