import { importProfile } from "./account";
import { twitchAccountSnapshot } from "./twitch";
import { save, type User } from "./store";

export async function syncTwitchAccount(
  user: User,
  snapshot = twitchAccountSnapshot,
): Promise<void> {
  const identity = user.identities?.find((i) => i.provider === "twitch");
  if (!identity) throw new Error("Connect Twitch first.");
  const data = await snapshot(identity.subject);
  const p = (user.profile ??= {});
  importProfile(user, "twitch", {
    subject: identity.subject,
    name: data.user.display_name,
    avatarUrl: data.user.profile_image_url,
    bio: data.user.description,
    login: data.user.login,
  });
  p.twitch = {
    subject: identity.subject,
    login: data.user.login,
    syncedAt: Date.now(),
    schedule: data.schedule ?? p.twitch?.schedule ?? [],
    history: data.history ?? p.twitch?.history ?? [],
    warnings: data.warnings,
  };
  if (user.role === "streamer")
    user.settings = { ...user.settings, twitchChannel: data.user.login };
  save();
}
