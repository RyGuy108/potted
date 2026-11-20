import { beforeEach, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../src/lib/session", () => ({ currentUser: vi.fn() }));
import { currentUser } from "../src/lib/session";
import {
  saveSettings,
  removePhoto,
  uploadPhoto,
  disconnectAccount,
  addBroadcast,
} from "../src/app/(site)/settings/actions";
import { db, resetForTests } from "../src/lib/store";

beforeEach(() => {
  resetForTests();
  vi.mocked(currentUser).mockReset();
});
it("requires a session for every account mutation", async () => {
  vi.mocked(currentUser).mockResolvedValue(undefined);
  for (const result of await Promise.all([
    saveSettings(new FormData()),
    removePhoto(),
    uploadPhoto(new FormData()),
    disconnectAccount("twitch"),
    addBroadcast(new FormData()),
  ])) {
    expect(result).toEqual({ ok: false, message: "Please sign in again." });
  }
});
it("takes the acting user from the session and ignores a submitted target user", async () => {
  const actor = db().users[0]!,
    other = db().users[1]!;
  const oldName = other.name;
  vi.mocked(currentUser).mockResolvedValue(actor);
  const f = new FormData();
  for (const [k, v] of Object.entries({
    userId: other.id,
    name: "My profile",
    bio: "Bio",
    website: "",
    timezone: "UTC",
    interests: "Chess",
  }))
    f.set(k, v);
  expect((await saveSettings(f)).ok).toBe(true);
  expect(actor.name).toBe("My profile");
  expect(other.name).toBe(oldName);
});
