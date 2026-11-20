"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar } from "./Avatar";
import type { AccountProfile, StreamEntry } from "@/lib/account-types";
import {
  disconnectAccount,
  saveSettings,
  uploadPhoto,
  removePhoto,
  refreshTwitch,
  addBroadcast,
  removeBroadcast,
  type SettingsResult,
} from "@/app/(site)/settings/actions";

type Props = {
  id: string;
  name: string;
  role: string;
  handle?: string;
  profile: AccountProfile;
  connections: {
    id: string;
    label: string;
    configured: boolean;
    linked: boolean;
  }[];
  message?: string;
};
export function AccountSettings({
  id,
  name,
  role,
  handle,
  profile: p,
  connections,
  message,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SettingsResult | null>(null);
  const [previewName, setPreviewName] = useState(name);
  const [previewBio, setPreviewBio] = useState(p.bio ?? "");
  const [section, setSection] = useState("profile");
  const form = useRef<HTMLFormElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [syncFields, setSyncFields] = useState({
    name: !p.manual?.name,
    bio: !p.manual?.bio,
    avatar: !p.manual?.avatar,
  });
  useEffect(() => {
    setSyncFields({
      name: !p.manual?.name,
      bio: !p.manual?.bio,
      avatar: !p.manual?.avatar,
    });
  }, [p.manual?.name, p.manual?.bio, p.manual?.avatar]);
  const streamer = role === "streamer";
  useEffect(() => {
    const sections = Array.from(content.current?.querySelectorAll<HTMLElement>(".settings-section") ?? []);
    if (!sections.length) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      let active = sections[0]!.id;
      for (const section of sections) {
        const anchorOffset = parseFloat(getComputedStyle(section).scrollMarginTop);
        if (section.getBoundingClientRect().top <= anchorOffset + 8) active = section.id;
      }
      if (window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        active = sections[sections.length - 1]!.id;
      }
      setSection(active);
    };
    const scheduleUpdate = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(scheduleUpdate);
    sections.forEach(section => observer.observe(section));
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    scheduleUpdate();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [streamer]);
  function run(work: () => Promise<SettingsResult>, reset?: () => void) {
    setResult(null);
    start(async () => {
      try {
        const answer = await work();
        setResult(answer);
        if (answer.ok) {
          reset?.();
          router.refresh();
        }
      } catch {
        setResult({
          ok: false,
          message: "Could not save. Check your connection and try again.",
        });
      }
    });
  }
  const sections = [
    ["profile", "Public profile", "01"],
    ["connections", "Connected accounts", "02"],
    ...(streamer ? [["broadcasts", "Schedule & streams", "03"]] : []),
    ["preferences", "Preferences", streamer ? "04" : "03"],
  ];
  return (
    <div className="account-settings">
      <aside className="settings-nav" aria-label="Settings sections">
        <Link href="/me" className="muted small">
          ← My account
        </Link>
        <h1>Settings</h1>
        <p className="muted">Make yourself at home.</p>
        <nav>
          {sections.map(([key, label, number]) => (
            <a
              key={key}
              href={`#${key}`}
              aria-current={section === key ? "location" : undefined}
            >
              <span className="mono">{number}</span>
              {label}
            </a>
          ))}
        </nav>
        <div className="settings-nav-foot">
          <span className="eyebrow">Your role</span>
          <strong>
            {streamer ? "Climber" : role === "mod" ? "Keeper" : "Planter"}
          </strong>
          <span className="muted small">
            Your account, your corner of Potted.
          </span>
        </div>
      </aside>
      <div className="settings-content" ref={content}>
        {message && (
          <p className="settings-notice" role="status">
            {message}
          </p>
        )}
        <section id="profile" className="settings-section">
          <div className="settings-section-heading">
            <div>
              <p className="eyebrow">A little more you</p>
              <h2>Public profile</h2>
              <p className="muted">
                The face and story behind your {streamer ? "stream" : "garden"}.
              </p>
            </div>
            <Link
              href={streamer ? `/s/${handle}` : `/u/${id}`}
              className="btn btn-ghost"
            >
              Preview profile ↗
            </Link>
          </div>
          <div className="profile-preview">
            <Avatar
              name={previewName || name}
              handle={id}
              src={p.avatarUrl}
              size={80}
            />
            <div>
              <span className="eyebrow">
                {streamer ? "Climber" : role === "mod" ? "Keeper" : "Planter"}{" "}
                on Potted
              </span>
              <h3>{previewName || name}</h3>
              <p>
                {previewBio ||
                  "A fresh start. Add a little about yourself below."}
              </p>
            </div>
            <span className="profile-preview-leaf" aria-hidden="true">
              ↗
            </span>
          </div>
          <div className="settings-photo row wrap">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const el = e.currentTarget;
                run(
                  () => uploadPhoto(new FormData(el)),
                  () => el.reset(),
                );
              }}
            >
              <label htmlFor="profile-photo">
                Profile photo{" "}
                <span className="muted small">
                  JPG, PNG or WebP · up to 2 MB · cropped square
                </span>
              </label>
              <div className="row wrap">
                <input
                  id="profile-photo"
                  name="photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                  disabled={pending}
                />
                <button className="btn btn-ghost" disabled={pending}>
                  Upload photo
                </button>
                {p.avatarUrl && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => run(removePhoto)}
                    disabled={pending}
                  >
                    Remove
                  </button>
                )}
              </div>
            </form>
          </div>
          <form
            id="account-settings-form"
            ref={form}
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              run(() => saveSettings(data));
            }}
          >
            <div className="settings-fields">
              <label>
                Display name
                <input
                  name="name"
                  required
                  maxLength={24}
                  defaultValue={name}
                  onChange={(e) => {
                    setPreviewName(e.target.value);
                    setSyncFields((s) => ({ ...s, name: false }));
                  }}
                  autoComplete="nickname"
                />
              </label>
              <label>
                Website or social link
                <input
                  name="website"
                  type="url"
                  placeholder="https://"
                  maxLength={2048}
                  defaultValue={p.website}
                />
                <span className="muted small">
                  A public link, separate from a verified connection.
                </span>
              </label>
            </div>
            <label>
              {streamer ? "About me:" : "Bio"}
              <textarea
                name="bio"
                rows={4}
                maxLength={500}
                defaultValue={p.bio}
                placeholder={
                  streamer
                    ? "What do you stream? What should your community know?"
                    : "Your favorite streams, games, and what you love to support."
                }
                onChange={(e) => {
                  setPreviewBio(e.target.value);
                  setSyncFields((s) => ({ ...s, bio: false }));
                }}
              />
              <span className="muted small">{previewBio.length}/500</span>
            </label>
            <label>
              Games & interests
              <input
                name="interests"
                maxLength={160}
                defaultValue={p.interests}
                placeholder="Chess, cozy games, cooking…"
              />
              <span className="muted small">Shown on your profile.</span>
            </label>
            {!streamer && (
              <Check
                name="publicProfile"
                checked={p.publicProfile === true}
                title="Publish my planter / keeper profile"
                detail="Share your photo, bio, interests and website. Your email and wallet are not included."
              />
            )}
            {p.source && (
              <div className="settings-import">
                <p className="small">
                  Profile source:{" "}
                  <strong>
                    {p.source === "twitch"
                      ? "Twitch"
                      : p.source === "google"
                        ? "Google"
                        : p.source === "discord"
                          ? "Discord"
                          : p.source}
                  </strong>
                  . Manual edits stay yours. Choose a field below to use its
                  imported value on the next refresh or sign-in.
                </p>
                <div className="row wrap">
                  {[
                    ["syncName", "name", "Import name"],
                    ["syncBio", "bio", "Import bio"],
                    ["syncAvatar", "avatar", "Import photo"],
                  ].map(([field, key, label]) => (
                    <label key={field} className="check">
                      <input
                        type="checkbox"
                        name={field}
                        checked={syncFields[key as "name" | "bio" | "avatar"]}
                        onChange={(e) =>
                          setSyncFields((s) => ({
                            ...s,
                            [key!]: e.target.checked,
                          }))
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </form>
        </section>
        <section id="connections" className="settings-section">
          <div className="settings-section-heading">
            <div>
              <p className="eyebrow">Bring your community</p>
              <h2>Connected accounts</h2>
              <p className="muted">
                Link an account to import your profile and sign in here.
              </p>
            </div>
          </div>
          <div className="connection-list">
            {connections.map((c) => (
              <div key={c.id} className="connection-row">
                <div
                  className={`provider-mark provider-${c.id}`}
                  aria-hidden="true"
                >
                  {c.label[0]}
                </div>
                <div className="connection-detail">
                  <strong>
                    {c.label}{" "}
                    {c.linked && (
                      <span className="connection-status">Connected</span>
                    )}
                  </strong>
                  <p className="muted small">
                    {c.id === "twitch"
                      ? "Photo, bio, upcoming schedule and available past broadcasts."
                      : c.id === "google"
                        ? "Name and photo. YouTube channels connect separately."
                        : "Display name and photo."}
                  </p>
                </div>
                {c.configured ? (
                  <a
                    className="btn btn-ghost"
                    href={`/api/auth/${c.id}/start?link=1`}
                  >
                    {c.linked ? "Reconnect / import" : "Connect"}
                  </a>
                ) : (
                  <span className="muted small">Not configured</span>
                )}
                {c.linked && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={pending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Disconnect ${c.label}? Keep another sign-in method connected. Imported ${c.id === "twitch" ? "profile, schedule and history" : "profile"} data will be removed; custom edits stay.`,
                        )
                      )
                        run(() => disconnectAccount(c.id));
                    }}
                  >
                    Disconnect
                  </button>
                )}
              </div>
            ))}
          </div>
          {!p.twitch && connections.some(c => c.id === "twitch" && c.linked) && (
            <div className="settings-sync"><p className="muted small">Your Twitch account is connected. Refresh to load its schedule and past broadcasts.</p><button type="button" className="btn btn-ghost" disabled={pending} onClick={() => run(refreshTwitch)}>Refresh Twitch</button></div>
          )}
          {p.twitch && (
            <div className="settings-sync">
              <div>
                <strong>twitch.tv/{p.twitch.login}</strong>
                <p className="muted small">
                  Last refreshed{" "}
                  {new Date(p.twitch.syncedAt).toLocaleString("en-US", {
                    timeZone: p.timezone || "UTC",
                  })}{" "}
                  ({p.timezone || "UTC"}). Refreshes when you sign in with
                  Twitch.
                </p>
                {p.twitch.warnings.map((w) => (
                  <p key={w} className="small settings-warning">
                    {w}
                  </p>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={pending}
                onClick={() => run(refreshTwitch)}
              >
                Refresh Twitch
              </button>
            </div>
          )}
          {streamer && (
            <Link
              href="/dashboard/channel#chat-bot"
              className="settings-shortcut"
            >
              <span>
                <strong>Kick, YouTube & chat controls</strong>
                <span className="muted small">
                  Manage channel connections, bot messages and announcements.
                </span>
              </span>
              <span aria-hidden="true">↗</span>
            </Link>
          )}
          <p className="muted small">
            Connecting never merges two existing Potted accounts. Save edits
            before leaving this page to connect.
          </p>
        </section>
        {streamer && (
          <section id="broadcasts" className="settings-section">
            <div className="settings-section-heading">
              <div>
                <p className="eyebrow">Give fans a reason to return</p>
                <h2>Schedule & past streams</h2>
                <p className="muted">
                  Twitch fills these in when connected. Add links from any
                  platform yourself.
                </p>
              </div>
            </div>
            <Check
              name="showSchedule"
              form="account-settings-form"
              checked={p.showSchedule !== false}
              title="Show upcoming streams on my profile"
              detail="Dates appear in the profile time zone you choose below."
            />
            <Check
              name="showHistory"
              form="account-settings-form"
              checked={p.showHistory !== false}
              title="Show past streams on my profile"
              detail="Imported Twitch history includes available archived broadcasts, not every stream ever made."
            />
            <BroadcastList
              kind="schedule"
              title="Coming up"
              entries={[...(p.schedule ?? []), ...(p.twitch?.schedule ?? [])]}
              zone={p.timezone || "UTC"}
              pending={pending}
              run={run}
            />
            <BroadcastList
              kind="history"
              title="Past streams"
              entries={[...(p.history ?? []), ...(p.twitch?.history ?? [])]}
              zone={p.timezone || "UTC"}
              pending={pending}
              run={run}
            />
            <form
              className="broadcast-form"
              onSubmit={(e) => {
                e.preventDefault();
                const el = e.currentTarget;
                const data = new FormData(el);
                const raw = String(data.get("startsAt"));
                if (!raw || !Number.isFinite(Date.parse(raw))) {
                  setResult({ ok: false, message: "Choose a valid date." });
                  return;
                }
                data.set("startsAt", new Date(raw).toISOString());
                run(
                  () => addBroadcast(data),
                  () => el.reset(),
                );
              }}
            >
              <h3>Add a broadcast</h3>
              <div className="settings-fields">
                <label>
                  List
                  <select name="kind">
                    <option value="schedule">Upcoming schedule</option>
                    <option value="history">Past streams</option>
                  </select>
                </label>
                <label>
                  Date & time
                  <input name="startsAt" type="datetime-local" required />
                  <span className="muted small">
                    Enter in your device’s local time.
                  </span>
                </label>
                <label>
                  Title
                  <input
                    name="title"
                    required
                    maxLength={120}
                    placeholder="Friday community games"
                  />
                </label>
                <label>
                  Stream or replay link
                  <input
                    name="url"
                    type="url"
                    required
                    placeholder="https://"
                    maxLength={2048}
                  />
                </label>
              </div>
              <button className="btn btn-ghost" disabled={pending}>
                Add broadcast
              </button>
            </form>
          </section>
        )}
        <section id="preferences" className="settings-section">
          <div className="settings-section-heading">
            <div>
              <p className="eyebrow">Potted, your way</p>
              <h2>Preferences</h2>
            </div>
          </div>
          <label>
            Profile time zone
            <input
              form="account-settings-form"
              name="timezone"
              required
              defaultValue={p.timezone || "America/Chicago"}
              list="profile-timezones"
              placeholder="America/Chicago"
            />
            <datalist id="profile-timezones">
              {[
                "America/Chicago",
                "America/New_York",
                "America/Los_Angeles",
                "America/Vancouver",
                "Europe/London",
                "Europe/Paris",
                "Asia/Tokyo",
                "Asia/Kolkata",
                "Australia/Sydney",
                "UTC",
              ].map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
            <span className="muted small">
              Used for your schedule and past streams.
            </span>
          </label>
          <h3>In-app notifications</h3>
          <Check
            name="community"
            form="account-settings-form"
            checked={p.notifications?.community !== false}
            title="Community updates"
            detail="New challenges, follows, suggestions and collaboration invites."
          />
          <Check
            name="awards"
            form="account-settings-form"
            checked={p.notifications?.awards !== false}
            title="Growth & milestones"
            detail="Badges, level-ups and achievements in your garden."
          />
          <p className="muted small">
            Payment, refund, proof-review and reward updates stay on so you can
            follow your commitments.
          </p>
          {streamer && (
            <div className="settings-links">
              <Link href="/dashboard/channel">
                Challenge rules, accepted games & minimum pledges ↗
              </Link>
              <Link href="/dashboard/channel">
                Overlay, voice & charity settings ↗
              </Link>
              <Link href="/dashboard/channel#payouts">Payout history ↗</Link>
            </div>
          )}
          {!streamer && (
            <div className="settings-links">
              <Link href="/garden">
                My pledges, refunds & channel rewards ↗
              </Link>
              <Link href="/browse">Find climbers to follow ↗</Link>
            </div>
          )}
        </section>
        <div className="settings-save">
          <span
            role={result?.ok === false ? "alert" : "status"}
            className={
              result?.ok === false ? "settings-warning" : "muted small"
            }
          >
            {pending
              ? "Saving…"
              : (result?.message ??
                "Your profile changes are saved only when you choose.")}
          </span>
          <button
            form="account-settings-form"
            className="btn"
            disabled={pending}
          >
            Save settings
          </button>
        </div>
      </div>
    </div>
  );
}
function Check({
  name,
  checked,
  title,
  detail,
  form,
}: {
  name: string;
  checked: boolean;
  title: string;
  detail: string;
  form?: string;
}) {
  return (
    <label className="settings-check">
      <span>
        <strong>{title}</strong>
        <span className="muted small">{detail}</span>
      </span>
      <input type="checkbox" name={name} form={form} defaultChecked={checked} />
    </label>
  );
}
function BroadcastList({
  kind,
  title,
  entries,
  zone,
  pending,
  run,
}: {
  kind: string;
  title: string;
  entries: StreamEntry[];
  zone: string;
  pending: boolean;
  run: (work: () => Promise<SettingsResult>) => void;
}) {
  const visible = entries
    .filter((e) => kind !== "schedule" || Date.parse(e.startsAt) > Date.now())
    .sort(
      (a, b) =>
        (Date.parse(a.startsAt) - Date.parse(b.startsAt)) *
        (kind === "history" ? -1 : 1),
    );
  return (
    <div className="broadcast-list">
      <h3>{title}</h3>
      {visible.length ? (
        visible.map((e) => (
          <div className="broadcast-row" key={e.id}>
            <div>
              <a href={e.url} target="_blank" rel="noreferrer">
                {e.title} ↗
              </a>
              <p className="muted small">
                {new Date(e.startsAt).toLocaleString("en-US", {
                  timeZone: zone,
                  dateStyle: "medium",
                  timeStyle: "short",
                })}{" "}
                · {zone} · {e.source === "manual" ? "Added by you" : "Twitch"}
              </p>
            </div>
            {e.source === "manual" && (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={pending}
                onClick={() => run(() => removeBroadcast(kind, e.id))}
                aria-label={`Remove ${e.title}`}
              >
                Remove
              </button>
            )}
          </div>
        ))
      ) : (
        <p className="empty">
          {kind === "schedule"
            ? "No upcoming streams yet. Connect Twitch or add your next stream below."
            : "No past broadcasts yet. Add a replay or refresh your Twitch connection."}
        </p>
      )}
    </div>
  );
}
