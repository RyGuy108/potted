import type { User } from "@/lib/store";
import { streamEntries } from "@/lib/account";
export function AccountProfile({ user }: { user: User }) {
  const p = user.profile;
  const zone = p?.timezone || "UTC";
  return (
    <div className="account-profile-details">
      {p?.bio && <p className="profile-bio lede">{p.bio}</p>}
      {p?.interests && <p className="muted small">Into {p.interests}</p>}
      {p?.website && (
        <a href={p.website} target="_blank" rel="noreferrer">
          Website / social ↗
        </a>
      )}
      {user.role === "streamer" && (
        <div className="account-broadcasts">
          {(["schedule", "history"] as const)
            .filter((kind) =>
              kind === "schedule"
                ? p?.showSchedule !== false
                : p?.showHistory !== false,
            )
            .map((kind) => {
              const entries = streamEntries(p, kind).slice(0, 6);
              return (
                <section key={kind}>
                  <p className="eyebrow">
                    {kind === "schedule" ? "Coming up" : "Catch up"}
                  </p>
                  <h2>
                    {kind === "schedule" ? "Stream schedule" : "Past streams"}
                  </h2>
                  {entries.length ? (
                    <ul>
                      {entries.map((e) => (
                        <li key={e.id}>
                          <a href={e.url} target="_blank" rel="noreferrer">
                            {e.title} ↗
                          </a>
                          <span className="muted small">
                            {new Date(e.startsAt).toLocaleString("en-US", {
                              timeZone: zone,
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}{" "}
                            · {zone} ·{" "}
                            {e.source === "twitch"
                              ? "Twitch"
                              : "Added by creator"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted small">
                      {kind === "schedule"
                        ? "No upcoming streams shared yet."
                        : "No past streams shared yet."}
                    </p>
                  )}
                  {p?.twitch && (
                    <p className="muted small">
                      Twitch snapshot:{" "}
                      {new Date(p.twitch.syncedAt).toLocaleDateString("en-US", {
                        timeZone: zone,
                      })}
                      {p.twitch.warnings.length
                        ? " · Some information could not be refreshed."
                        : ""}
                    </p>
                  )}
                </section>
              );
            })}
        </div>
      )}
    </div>
  );
}
