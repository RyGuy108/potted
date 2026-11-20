/** A colour from the handle, so streamers without a Twitch picture still look distinct. */
function hue(seed: string): number {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function Avatar({
  name,
  handle,
  src,
  size = 84,
}: {
  name: string;
  handle: string;
  src?: string | null;
  size?: number;
}) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        className="avatar"
        src={src}
        alt={`${name}'s profile picture`}
        width={size}
        height={size}
      />
    );
  }
  const h = hue(handle);
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className="avatar avatar-initials"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `linear-gradient(135deg, hsl(${h} 65% 45%), hsl(${(h + 50) % 360} 70% 32%))`,
      }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
