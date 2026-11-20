import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { demoAccountsOn } from "../src/lib/demo-mode";
import { PURGES, runPurges } from "../src/lib/purge";
import { dataDir, db, resetForTests } from "../src/lib/store";

describe("demo accounts switch", () => {
  it("is off on Railway production unless turned on, on elsewhere", () => {
    expect(demoAccountsOn({})).toBe(true);
    expect(demoAccountsOn({ RAILWAY_ENVIRONMENT_NAME: "production" })).toBe(false);
    expect(demoAccountsOn({ RAILWAY_ENVIRONMENT_NAME: "production", POTTED_DEMO_ACCOUNTS: "on" })).toBe(true);
    expect(demoAccountsOn({ POTTED_DEMO_ACCOUNTS: "off" })).toBe(false);
  });
});

describe("purge", () => {
  it("backs up, removes every account and their records, and runs once", () => {
    resetForTests();
    const state = db();
    state.secret = "keep-me";
    state.causeWallets = { pantry: "wallet1" };
    state.users.push({ id: "u_google", name: "Friend", role: "fan", wallet: "sim:u_google", createdAt: 1, email: "f@example.com", identities: [{ provider: "google", subject: "1" }] });
    state.notices = [{ id: "n1", userId: "u_google", at: 1, kind: "gift", title: "", body: "", href: "/", read: false }];
    const before = state.users.length;

    const [result] = runPurges({ env: {} });
    expect(result!.id).toBe(PURGES[0]);
    expect(result!.removedUsers).toHaveLength(before);
    expect(result!.removedUsers.find((u) => u.id === "u_google")?.providers).toEqual(["google"]);
    const backup = JSON.parse(fs.readFileSync(result!.backup!, "utf8"));
    expect(backup.users).toHaveLength(before);
    expect(result!.backup!.startsWith(dataDir())).toBe(true);

    expect(db().users).toHaveLength(0);
    expect(db().notices).toBeUndefined();
    expect(db().secret).toBe("keep-me");
    expect(db().causeWallets).toEqual({ pantry: "wallet1" });
    expect(db().purges).toEqual([...PURGES]);

    db().users.push({ id: "u_new", name: "Real", role: "fan", wallet: "sim:u_new", createdAt: 2 });
    expect(runPurges({ env: {} })).toEqual([]);
    expect(db().users.map((u) => u.id)).toEqual(["u_new"]);
  });

  it("can be skipped", () => {
    resetForTests();
    expect(runPurges({ env: { POTTED_PURGE: "off" } })).toEqual([]);
    expect(db().users.length).toBeGreaterThan(0);
  });
});

describe("single account removal", () => {
  it("removes PsychedTerror and its challenge once, keeps sample climbers, and frees the Twitch channel", async () => {
    const { runAccountRemovals } = await import("../src/lib/purge");
    const service = await import("../src/lib/service");
    resetForTests();
    const state = db();
    state.purges = [];
    state.users.push(
      { id: "u_pt", name: "PsychedTerror", role: "streamer", handle: "psychedterror", wallet: "sim:u_pt", createdAt: 1, identities: [{ provider: "twitch", subject: "t1" }], settings: { twitchChannel: "psychedterror" } },
      { id: "u_s_moss", name: "Moss", role: "streamer", handle: "mossbyte", wallet: "sim:u_s_moss", createdAt: 1 },
    );
    state.challenges.push({ id: "ch_pt", streamerId: "u_pt" } as never);
    state.notices = [{ id: "n1", userId: "u_pt", at: 1, kind: "challenge", title: "", body: "", href: "/c/ch_pt", read: false }];

    const [result] = runAccountRemovals({ env: {} });
    expect(result!.removedUsers.map((u) => u.id)).toEqual(["u_pt"]);
    expect(result!.removedChallenges).toBe(1);
    expect(fs.existsSync(result!.backup!)).toBe(true);
    expect(service.getUser("u_pt")).toBeUndefined();
    expect(service.getUser("u_s_moss")).toBeDefined();
    expect(db().challenges.some((c) => c.id === "ch_pt")).toBe(false);
    expect(db().notices).toEqual([]);
    expect(runAccountRemovals({ env: {} })).toEqual([]);
  });

  it("leaves the account alone when other people's money is on its challenges", async () => {
    const { runAccountRemovals } = await import("../src/lib/purge");
    resetForTests();
    const state = db();
    state.purges = [];
    state.users.push({ id: "u_pt", name: "PsychedTerror", role: "streamer", handle: "psychedterror", wallet: "sim:u_pt", createdAt: 1 });
    state.challenges.push({ id: "ch_pt", streamerId: "u_pt" } as never);
    state.pledges.push({ id: "p1", challengeId: "ch_pt", userId: "u_fan" } as never);
    expect(runAccountRemovals({ env: {} })).toEqual([]);
    expect(db().users.some((u) => u.id === "u_pt")).toBe(true);
  });
});
