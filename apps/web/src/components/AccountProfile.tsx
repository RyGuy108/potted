import type { User } from "@/lib/store";
import { streamEntries } from "@/lib/account";
import { StreamCalendar } from "./StreamCalendar";

export function AccountProfile({ user }: { user: User }) {
  const p = user.profile;
  const zone = p?.timezone || "UTC";
  const streamer = user.role === "streamer";
  const snapshot = p?.twitch && (
    <p className="muted small broadcast-snapshot">
      Twitch snapshot: {new Date(p.twitch.syncedAt).toLocaleDateString("en-US", { timeZone: zone })}
      {p.twitch.warnings.length ? " · Some information could not be refreshed." : ""}
    </p>
  );
  const history = streamer ? streamEntries(p, "history") : [];
  return (
    <div className="account-profile-details">
      {p?.bio && (
        <>
          {streamer && <h2 className="profile-about-heading">About me:</h2>}
          <p className="profile-bio lede">{p.bio}</p>
        </>
      )}
      {p?.interests && <p className="muted small">Into {p.interests}</p>}
      {p?.website && (
        <a href={p.website} target="_blank" rel="noreferrer">
          Website / social ↗
        </a>
      )}
      {streamer && (p?.showSchedule !== false || p?.showHistory !== false) && (
        <div className="account-broadcasts">
          {p?.showSchedule !== false && (
            <section>
              <h2>Stream schedule</h2>
              <p className="muted small">Times shown in {zone}</p>
              <StreamCalendar
                entries={streamEntries(p, "schedule")}
                zone={zone}
                today={new Date().toLocaleDateString("en-CA", {
                  timeZone: zone,
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                })}
              />
              {snapshot}
            </section>
          )}
          {p?.showHistory !== false && (
            <section>
              <h2>Past streams</h2>
              {history.length ? (
                <ul className="broadcast-history" aria-label="Past streams" tabIndex={0}>
                  {history.map((entry) => (
                    <li key={entry.id}>
                      <a href={entry.url} target="_blank" rel="noreferrer">
                        {entry.title} ↗
                      </a>
                      <span className="muted small">
                        {new Date(entry.startsAt).toLocaleString("en-US", {
                          timeZone: zone,
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                        {" · "}
                        {zone}
                        {" · "}
                        {entry.source === "twitch" ? "Twitch" : "Added by creator"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted small">No past streams shared yet.</p>
              )}
              {snapshot}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
