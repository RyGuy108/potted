import { beforeEach, describe, expect, it } from "vitest";
import {
  importProfile,
  linkIdentity,
  updateAccount,
  addStreamEntry,
  removeStreamEntry,
  publicAccount,
  streamEntries,
  unlinkIdentity,
} from "../src/lib/account";
import { syncTwitchAccount } from "../src/lib/account-sync";
import { twitchAccountSnapshot, resetTwitchCache } from "../src/lib/twitch";
import { db, resetForTests, type User } from "../src/lib/store";
import { notify, noticesFor } from "../src/lib/notifications";

let user: User;
beforeEach(() => {
  resetForTests();
  resetTwitchCache();
  user = db().users.find((u) => u.role === "streamer")!;
});
function form(values: Record<string, string> = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    name: user.name,
    bio: "",
    website: "",
    timezone: "America/Chicago",
    interests: "",
    community: "on",
    awards: "on",
    ...values,
  }))
    f.set(k, v);
  return f;
}
describe("account settings", () => {
  it("imports profile data but protects manually edited fields across subsequent sign-ins", () => {
    importProfile(user, "twitch", {
      subject: "123",
      name: "Twitch Name",
      bio: "Original bio",
      avatarUrl: "https://example.com/a.jpg",
      login: "verified",
    });
    updateAccount(
      user,
      form({
        name: "My name",
        bio: "My bio",
        syncName: "on",
        syncBio: "on",
        syncAvatar: "on",
      }),
    );
    importProfile(user, "twitch", {
      subject: "123",
      name: "Changed upstream",
      bio: "Changed bio",
      avatarUrl: "https://example.com/new.jpg",
    });
    expect(user.name).toBe("My name");
    expect(user.profile?.bio).toBe("My bio");
    expect(user.profile?.avatarUrl).toBe("https://example.com/new.jpg");
    updateAccount(
      user,
      form({
        name: user.name,
        bio: "My bio",
        syncName: "on",
        syncBio: "on",
        syncAvatar: "on",
      }),
    );
    importProfile(user, "twitch", {
      subject: "123",
      name: "Restored",
      bio: "New bio",
    });
    expect(user.name).toBe("Restored");
    expect(user.profile?.bio).toBe("New bio");
  });
  it("never merges accounts by email or permits stealing a linked identity", () => {
    const other = db().users.find((u) => u.id !== user.id)!;
    other.identities = [{ provider: "twitch", subject: "123" }];
    expect(() =>
      linkIdentity(user, "twitch", {
        subject: "123",
        name: "Attacker",
        email: other.email,
      }),
    ).toThrow("another Potted account");
    expect(user.identities?.length ?? 0).toBe(0);
    linkIdentity(user, "twitch", { subject: "456", name: "Mine" });
    linkIdentity(user, "twitch", { subject: "456", name: "Mine" });
    expect(user.identities).toHaveLength(1);
    expect(() =>
      linkIdentity(user, "twitch", { subject: "789", name: "Different" }),
    ).toThrow("different account");
  });
  it("validates atomically, rejects unsafe links/timezones and ignores role and wallet injection", () => {
    const name = user.name,
      wallet = user.wallet;
    expect(() =>
      updateAccount(
        user,
        form({ name: "Changed", website: "javascript:alert(1)" }),
      ),
    ).toThrow("https");
    expect(user.name).toBe(name);
    expect(() => updateAccount(user, form({ timezone: "Not/AZone" }))).toThrow(
      "time zone",
    );
    expect(() =>
      updateAccount(
        user,
        form({ website: "https://user:password@example.com" }),
      ),
    ).toThrow();
    updateAccount(
      user,
      form({ role: "mod", wallet: "attacker", bio: "Hello" }),
    );
    expect(user.role).toBe("streamer");
    expect(user.wallet).toBe(wallet);
    expect(publicAccount(user)).not.toHaveProperty("wallet");
    expect(publicAccount(user)).not.toHaveProperty("identities");
    expect(publicAccount(user)).not.toHaveProperty("email");
  });
  it("applies preferences while preserving transaction, refund and dispute notices", () => {
    updateAccount(user, form({ community: "", awards: "" }));
    for (const kind of [
      "challenge",
      "award",
      "money",
      "refund",
      "dispute",
    ] as const)
      notify(user.id, kind, "Title", "Body", "/me");
    const kinds = noticesFor(user).map((n) => n.kind);
    expect(kinds).not.toContain("award");
    expect(kinds).not.toContain("challenge");
    expect(kinds).toEqual(
      expect.arrayContaining(["money", "refund", "dispute"]),
    );
  });
  it("separates manual history from imported history and prevents cross-account deletion", () => {
    const f = form({
      kind: "history",
      title: "Replay",
      startsAt: "2026-01-01T12:00:00Z",
      url: "https://example.com/replay",
    });
    addStreamEntry(user, f);
    const id = user.profile!.history![0]!.id;
    const other = db().users.find((u) => u.id !== user.id)!;
    removeStreamEntry(other, "history", id);
    expect(streamEntries(user.profile, "history")).toHaveLength(1);
    expect(() => addStreamEntry({ ...user, role: "fan" }, f)).toThrow(
      "climbers",
    );
    expect(() =>
      addStreamEntry(
        user,
        form({
          kind: "schedule",
          title: "Old",
          startsAt: "2020-01-01T00:00:00Z",
          url: "https://example.com",
        }),
      ),
    ).toThrow();
    removeStreamEntry(user, "history", id);
    expect(streamEntries(user.profile, "history")).toHaveLength(0);
  });
  it("disconnects only owned identities, retains manual edits and prevents sign-in lockout", () => {
    user.identities = [{ provider: "twitch", subject: "123" }];
    expect(() => unlinkIdentity(user, "twitch")).toThrow("another sign-in");
    user.identities.push({ provider: "google", subject: "456" });
    user.profile = {
      source: "twitch",
      bio: "Custom",
      avatarUrl: "https://example.com/a.jpg",
      manual: { bio: true },
      twitch: {
        subject: "123",
        login: "verified",
        syncedAt: 1,
        schedule: [],
        history: [],
        warnings: [],
      },
    };
    user.settings = { twitchChannel: "verified" };
    unlinkIdentity(user, "twitch");
    expect(user.profile.bio).toBe("Custom");
    expect(user.profile.avatarUrl).toBeUndefined();
    expect(user.profile.twitch).toBeUndefined();
    expect(user.settings.twitchChannel).toBe("");
    expect(user.identities).toEqual([{ provider: "google", subject: "456" }]);
  });
  it("uses the verified identity and preserves previous snapshots when a provider section fails", async () => {
    user.identities = [{ provider: "twitch", subject: "123" }];
    const entry = {
      id: "old",
      title: "Saved",
      startsAt: "2026-01-01T12:00:00Z",
      url: "https://www.twitch.tv/videos/1",
      source: "twitch" as const,
    };
    user.profile = {
      twitch: {
        subject: "123",
        login: "old",
        syncedAt: 1,
        schedule: [],
        history: [entry],
        warnings: [],
      },
    };
    let supplied = "";
    await syncTwitchAccount(user, async (id) => {
      supplied = id;
      return {
        user: {
          id,
          login: "verified",
          display_name: "Verified",
          description: "Bio",
          profile_image_url: "https://example.com/photo",
        },
        schedule: [],
        history: undefined,
        warnings: ["History unavailable"],
      };
    });
    expect(supplied).toBe("123");
    expect(user.profile.twitch?.history).toEqual([entry]);
    expect(user.settings?.twitchChannel).toBe("verified");
    expect(user.profile.twitch?.warnings).toHaveLength(1);
    const noIdentity = { ...user, identities: [] };
    await expect(syncTwitchAccount(noIdentity)).rejects.toThrow(
      "Connect Twitch",
    );
  });
  it("handles missing schedules, excludes canceled entries and reports partial API failures", async () => {
    const base = {
      env: { TWITCH_CLIENT_ID: "id", TWITCH_CLIENT_SECRET: "secret" },
      now: () => 1000,
    };
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("oauth2"))
        return Response.json({ access_token: "token", expires_in: 3600 });
      if (url.includes("users?"))
        return Response.json({
          data: [
            {
              id: "123",
              login: "creator",
              display_name: "Creator",
              description: "Bio",
              profile_image_url: "https://example.com/a.jpg",
            },
          ],
        });
      if (url.includes("schedule?")) return new Response("", { status: 404 });
      return new Response("", { status: 503 });
    }) as typeof fetch;
    const result = await twitchAccountSnapshot("123", {
      ...base,
      fetch: fetcher,
    });
    expect(result.schedule).toEqual([]);
    expect(result.history).toBeUndefined();
    expect(result.warnings).toHaveLength(1);
    const result2 = await twitchAccountSnapshot("123", {
      ...base,
      fetch: (async (input: string | URL | Request, init?: RequestInit) =>
        String(input).includes("schedule?")
          ? Response.json({
              data: {
                segments: [
                  {
                    id: "x",
                    title: "Canceled",
                    start_time: "2030-01-01T12:00:00Z",
                    canceled_until: "2030-01-02T12:00:00Z",
                  },
                ],
              },
            })
          : fetcher(input, init)) as typeof fetch,
    });
    expect(result2.schedule).toEqual([]);
  });
});
