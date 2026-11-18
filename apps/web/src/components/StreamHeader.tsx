import type { TwitchChannel } from "@/lib/twitch";

/** A colour from the handle, so streamers without a Twitch picture still look distinct. */
function hue(seed: string): number {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function Avatar({ name, handle, src, size = 84 }: { name: string; handle: string; src?: string | null; size?: number }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="avatar" src={src} alt={`${name}'s profile picture`} width={size} height={size} />;
  }
  const h = hue(handle);
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="avatar avatar-initials" style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, hsl(${h} 65% 45%), hsl(${(h + 50) % 360} 70% 32%))` }} aria-hidden="true">
      {initials}
    </span>
  );
}

/** The streamer's picture, name and where to watch. */
export function StreamHeader({ name, handle, twitch, twitchLogin }: { name: string; handle: string; twitch: TwitchChannel | null; twitchLogin: string }) {
  return (
    <header className="stream-header">
      <div className={`avatar-ring${twitch?.live ? " is-live" : ""}`}>
        <Avatar name={name} handle={handle} src={twitch?.profileImageUrl} />
        {twitch?.live && <span className="live-pill">LIVE</span>}
      </div>
      <div>
        <p className="eyebrow">Stream</p>
        <h1>{name}&apos;s challenges</h1>
        <p className="muted small">
          potted/s/{handle}
          {twitchLogin && (
            <>
              {" · "}
              <a href={`https://www.twitch.tv/${twitchLogin}`} target="_blank" rel="noreferrer">
                twitch.tv/{twitchLogin}
              </a>
            </>
          )}
        </p>
      </div>
    </header>
  );
}

const since = (iso: string) => {
  const mins = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
};

/** A frame of the live stream that opens it on Twitch, or the offline banner. */
export function StreamPreview({ twitch, name }: { twitch: TwitchChannel; name: string }) {
  const live = twitch.live;
  const image = live?.thumbnailUrl || twitch.offlineImageUrl;
  return (
    <a className={`stream-preview${live ? " is-live" : ""}`} href={twitch.url} target="_blank" rel="noreferrer" aria-label={live ? `Watch ${name} live on Twitch` : `Open ${name}'s Twitch channel`}>
      <div className="stream-frame">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" />
        ) : (
          <span className="stream-frame-empty">{name} is offline</span>
        )}
        <span className="play" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30">
            <path d="M8 5v14l11-7z" fill="currentColor" />
          </svg>
        </span>
        {live ? (
          <span className="stream-badges">
            <span className="live-pill">LIVE</span>
            <span className="viewer-pill">{live.viewers.toLocaleString()} watching</span>
          </span>
        ) : (
          <span className="stream-badges">
            <span className="viewer-pill">Offline</span>
          </span>
        )}
      </div>
      <div className="stream-meta">
        <strong>{live ? live.title : `${name} is offline right now`}</strong>
        <span className="muted small">{live ? `${live.gameName || "Streaming"} · live for ${since(live.startedAt)} · Watch on Twitch` : "Open the channel on Twitch"}</span>
      </div>
    </a>
  );
}
