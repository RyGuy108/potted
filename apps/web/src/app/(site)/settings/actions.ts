"use server";
import { revalidatePath } from "next/cache";
import { profilePhoto } from "@/lib/profile-photo";
import { currentUser } from "@/lib/session";
import {
  updateAccount,
  addStreamEntry,
  removeStreamEntry,
  unlinkIdentity,
} from "@/lib/account";
import { syncTwitchAccount } from "@/lib/account-sync";
import { save, type User } from "@/lib/store";

export type SettingsResult = { ok: boolean; message: string };
async function act(
  work: (user: User) => Promise<void> | void,
): Promise<SettingsResult> {
  const user = await currentUser();
  if (!user) return { ok: false, message: "Please sign in again." };
  try {
    await work(user);
    revalidatePath("/", "layout");
    return { ok: true, message: "Saved." };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not save. Try again.",
    };
  }
}
export async function saveSettings(data: FormData) {
  return act((user) => updateAccount(user, data));
}
export async function refreshTwitch() {
  return act((user) => syncTwitchAccount(user));
}
export async function addBroadcast(data: FormData) {
  return act((user) => addStreamEntry(user, data));
}
export async function removeBroadcast(kind: string, id: string) {
  return act((user) => removeStreamEntry(user, kind, id));
}
export async function removePhoto() {
  return act((user) => {
    const p = (user.profile ??= {});
    p.avatarUrl = "";
    p.manual = { ...p.manual, avatar: true };
    save();
  });
}
export async function uploadPhoto(data: FormData) {
  return act(async (user) => {
    const avatarUrl = await profilePhoto(data.get("photo"));
    const p = (user.profile ??= {});
    p.avatarUrl = avatarUrl;
    p.manual = { ...p.manual, avatar: true };
    save();
  });
}

export async function disconnectAccount(provider: string) {
  return act((user) => unlinkIdentity(user, provider));
}
