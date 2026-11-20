import type { LiveSession } from "@/lib/store";
import type { TwitchChannel } from "@/lib/twitch";
import { GameArt } from "./GameArt";

import { Avatar } from "./Avatar";
export { Avatar } from "./Avatar";

/** The streamer's picture, name and where to watch. */
const PLATFORM = { twitch: "Twitch", youtube: "YouTube", kick: "Kick" } as const;

export function StreamHeader({
  name,
  handle,
  twitch,
  twitchLogin,
  session,
  follow,
  avatarUrl,
}: {
  name: string;
  handle: string;
  avatarUrl?: string;
  twitch: TwitchChannel | null;
  twitchLogin: string;
  /** The stream the climber said they started, on any platform. */
  session?: LiveSession;
  /** A follow button, for planters. */
  follow?: React.ReactNode;
}) {
  const live = Boolean(twitch?.live || session);
  return (
    <header className="stream-header">
      <div className={`avatar-ring${live ? " is-live" : ""}`}>
        <Avatar name={name} handle={handle} src={avatarUrl ?? twitch?.profileImageUrl} />
        {live && <span className="live-pill">LIVE</span>}
      </div>
      <div>
        <p className="eyebrow">Stream</p>
        <h1>{name}&apos;s challenges</h1>
        <p className="muted small">
          potted/s/{handle}
          {session && (
            <>
              {" · "}
              <a href={session.url} target="_blank" rel="noreferrer" className="watch-link" data-testid="watch-link">
                Watch on {PLATFORM[session.platform]}
                {session.title ? `: ${session.title}` : ""}
              </a>
            </>
          )}
          {twitchLogin && session?.platform !== "twitch" && (
            <>
              {" · "}
              <a href={`https://www.twitch.tv/${twitchLogin}`} target="_blank" rel="noreferrer">
                twitch.tv/{twitchLogin}
              </a>
            </>
          )}
        </p>
        {follow}
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

/**
 * When the climber has not linked Twitch (or Twitch can't be reached): the
 * game's art, linking to that game's category on Twitch, or Twitch's front page.
 */
export function CategoryPreview({ name, gameId, gameName, url }: { name: string; gameId?: string; gameName?: string; url: string }) {
  const label = gameName ? `Watch ${gameName} on Twitch` : "Watch on Twitch";
  return (
    <a className="stream-preview" href={url} target="_blank" rel="noreferrer" aria-label={label}>
      <div className="stream-frame">
        <GameArt id={gameId ?? "other"} name={gameName ?? "Twitch"} />
        <span className="play" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30">
            <path d="M8 5v14l11-7z" fill="currentColor" />
          </svg>
        </span>
        {gameName && (
          <span className="stream-badges">
            <span className="viewer-pill">{gameName}</span>
          </span>
        )}
      </div>
      <div className="stream-meta">
        <strong>{gameName ? `${name} plays ${gameName}` : `Find ${name} on Twitch`}</strong>
        <span className="muted small">{gameName ? `Open ${gameName} streams on Twitch` : "Open Twitch"}</span>
      </div>
    </a>
  );
}
