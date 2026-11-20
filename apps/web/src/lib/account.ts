import type { Profile } from "./oauth";
import { db, save, type User } from "./store";
import type { AccountProfile, StreamEntry } from "./account-types";

export function httpsUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const u = new URL(value.trim());
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.href.length > 2048
    )
      throw new Error();
    return u.href;
  } catch {
    throw new Error("Use a complete https:// link.");
  }
}
export function safeImage(value: unknown): string | undefined {
  try {
    return httpsUrl(value) || undefined;
  } catch {
    return undefined;
  }
}

/** Only a successful OAuth response may call this, never a public channel URL. */
export function importProfile(
  user: User,
  provider: string,
  profile: Profile,
): void {
  if (!["google", "twitch", "discord"].includes(provider)) return;
  const p = (user.profile ??= {});
  if (p.source && p.source !== provider) return;
  p.source = provider;
  if (!p.manual?.name)
    user.name = profile.name.trim().slice(0, 24) || user.name;
  if (!p.manual?.bio && profile.bio !== undefined)
    p.bio = profile.bio.slice(0, 500);
  if (!p.manual?.avatar && safeImage(profile.avatarUrl))
    p.avatarUrl = safeImage(profile.avatarUrl);
  if (provider === "twitch" && profile.login && user.role === "streamer") {
    user.settings = { ...user.settings, twitchChannel: profile.login };
  }
  p.importedAt = Date.now();
}

export function linkIdentity(
  user: User,
  provider: string,
  profile: Profile,
): void {
  const owner = db().users.find((u) =>
    u.identities?.some(
      (i) => i.provider === provider && i.subject === profile.subject,
    ),
  );
  if (owner && owner.id !== user.id)
    throw new Error(
      "This platform account already belongs to another Potted account.",
    );
  if (
    user.identities?.some(
      (i) => i.provider === provider && i.subject !== profile.subject,
    )
  )
    throw new Error(
      "A different account from this provider is already linked.",
    );
  if (!owner)
    (user.identities ??= []).push({ provider, subject: profile.subject });
  // Linking explicitly selects this provider; custom fields remain protected.
  (user.profile ??= {}).source = provider;
  importProfile(user, provider, profile);
  save();
}

function field(data: FormData, key: string, max: number): string {
  const value = data.get(key);
  if (typeof value !== "string" || value.length > max)
    throw new Error(`${key} is missing or too long (maximum ${max}).`);
  return value.trim();
}

/** Validate everything before mutating the user; financial and role fields are never accepted. */
export function updateAccount(user: User, data: FormData): void {
  const name = field(data, "name", 24);
  if (!name) throw new Error("Add a display name.");
  const bio = field(data, "bio", 500);
  const website = httpsUrl(field(data, "website", 2048));
  const timezone = field(data, "timezone", 80);
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
  } catch {
    throw new Error("Choose a valid time zone, such as America/Chicago.");
  }
  const interests = field(data, "interests", 160);
  const old = user.profile ?? {};
  const manual = { ...old.manual };
  if (name !== user.name) manual.name = true;
  if (bio !== (old.bio ?? "")) manual.bio = true;
  // Returning to imported values is deliberate, per field.
  if (old.source) {
    manual.name = name !== user.name || data.get("syncName") !== "on";
    manual.bio = bio !== (old.bio ?? "") || data.get("syncBio") !== "on";
    manual.avatar = data.get("syncAvatar") !== "on";
  }
  user.name = name;
  user.profile = {
    ...old,
    bio,
    website,
    timezone,
    interests,
    manual,
    publicProfile: data.get("publicProfile") === "on",
    showSchedule: data.get("showSchedule") === "on",
    showHistory: data.get("showHistory") === "on",
    notifications: {
      community: data.get("community") === "on",
      awards: data.get("awards") === "on",
    },
  };
  save();
}

export function addStreamEntry(user: User, data: FormData): void {
  if (user.role !== "streamer")
    throw new Error("Only climbers can add broadcasts.");
  const kind = data.get("kind");
  if (kind !== "schedule" && kind !== "history")
    throw new Error("Choose a schedule or past stream.");
  const title = field(data, "title", 120);
  const date = field(data, "startsAt", 40);
  if (
    !title ||
    !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(date) ||
    !Number.isFinite(Date.parse(date))
  )
    throw new Error("Add a title and valid date.");
  const startsAt = new Date(date).toISOString();
  if (kind === "schedule" && Date.parse(date) < Date.now())
    throw new Error("Choose a future date for an upcoming stream.");
  if (kind === "history" && Date.parse(date) > Date.now())
    throw new Error("Past streams must have a past date.");
  const url = httpsUrl(field(data, "url", 2048));
  if (!url) throw new Error("Add a stream or replay link.");
  const p = (user.profile ??= {});
  const list = p[kind] ?? [];
  if (list.length >= 20)
    throw new Error("Remove an entry before adding more (20 maximum).");
  p[kind] = [
    ...list,
    { id: crypto.randomUUID(), title, startsAt, url, source: "manual" },
  ];
  save();
}
export function removeStreamEntry(user: User, kind: string, id: string): void {
  if (kind !== "schedule" && kind !== "history")
    throw new Error("Unknown list.");
  if (user.profile)
    user.profile[kind] = user.profile[kind]?.filter((e) => e.id !== id);
  save();
}
export function streamEntries(
  p: AccountProfile | undefined,
  kind: "schedule" | "history",
): StreamEntry[] {
  return [...(p?.[kind] ?? []), ...(p?.twitch?.[kind] ?? [])]
    .filter((e) => kind !== "schedule" || Date.parse(e.startsAt) > Date.now())
    .sort(
      (a, b) =>
        (Date.parse(a.startsAt) - Date.parse(b.startsAt)) *
        (kind === "history" ? -1 : 1),
    );
}

/** Explicit allowlist: never send the User record, OAuth tokens or wallet to a profile client. */
export function publicAccount(user: User) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    handle: user.handle,
    bio: user.profile?.bio,
    avatarUrl: user.profile?.avatarUrl,
    website: user.profile?.website,
    interests: user.profile?.interests,
    timezone: user.profile?.timezone ?? "UTC",
  };
}

export function unlinkIdentity(user: User, provider: string): void {
  const identities = user.identities ?? [];
  if (!identities.some((i) => i.provider === provider))
    throw new Error("That account is not connected.");
  if (identities.length < 2)
    throw new Error(
      "Connect another sign-in method before disconnecting your last one.",
    );
  user.identities = identities.filter((i) => i.provider !== provider);
  const p = user.profile;
  if (p?.source === provider) {
    if (!p.manual?.avatar) delete p.avatarUrl;
    if (!p.manual?.bio) delete p.bio;
    delete p.source;
    delete p.importedAt;
  }
  if (provider === "twitch" && p?.twitch) {
    if (user.settings?.twitchChannel === p.twitch.login)
      user.settings.twitchChannel = "";
    delete p.twitch;
  }
  save();
}
