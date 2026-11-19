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
