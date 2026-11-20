import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkCode, sendCode } from "../src/lib/email-auth";
import { demoSeedMode, ensureDemoSeed, needsFreshLive } from "../src/lib/demo-seed";
import { DEMO_LOGINS, isSampleId } from "../src/lib/sample-data";
import * as service from "../src/lib/service";
import { db, resetForTests } from "../src/lib/store";

const saved = { ...process.env };
beforeEach(() => resetForTests());
afterEach(() => {
  process.env = { ...saved };
});

describe("demo seed", () => {
  it("is on by default only on Railway production", () => {
    expect(demoSeedMode({})).toBe("off");
    expect(demoSeedMode({ RAILWAY_ENVIRONMENT_NAME: "production" })).toBe("on");
    expect(demoSeedMode({ RAILWAY_ENVIRONMENT_NAME: "production", POTTED_DEMO_SEED: "off" })).toBe("off");
    expect(demoSeedMode({ POTTED_DEMO_SEED: "remove" })).toBe("remove");
  });

  it("loads history and live pots once, reopens pots when they close, and comes back out cleanly", async () => {
    process.env.POTTED_DEMO_SEED = "on";
    const real = await service.signIn("Real Person", "fan");
    await ensureDemoSeed(() => {});
    const state = db();
    expect(state.sample).toBeDefined();
    const live = state.challenges.filter((c) => state.sample!.challengeIds.includes(c.id));
    expect(live.filter((c) => c.status === "open").length).toBeGreaterThan(5);
    expect(needsFreshLive(state)).toBe(false);
    // Every demo login exists with its address.
    for (const login of DEMO_LOGINS) expect(service.getUser(login.id)).toMatchObject({ email: login.email, role: login.role });

    // A second call adds nothing.
    const users = state.users.length;
    await ensureDemoSeed(() => {});
    expect(db().users.length).toBe(users);

    // Once every live pot has closed, a fresh set opens and the old one stays as history.
    for (const c of live) if (c.status === "open") c.deadline = Date.now() - 1;
    expect(needsFreshLive(db())).toBe(true);
    await ensureDemoSeed(() => {});
    expect(needsFreshLive(db())).toBe(false);
    expect(db().sample!.challengeIds.length).toBeGreaterThan(live.length);

    process.env.POTTED_DEMO_SEED = "remove";
    await ensureDemoSeed(() => {});
    expect(db().sample).toBeUndefined();
    expect(db().users.some((u) => isSampleId(u.id))).toBe(false);
    expect(db().challenges.some((c) => isSampleId(c.streamerId))).toBe(false);
    expect(service.getUser(real.id)).toBeDefined();
  });
});

describe("demo seed on the live server", () => {
  it("works without the demo climbers Ryan and Kai", async () => {
    process.env.RAILWAY_ENVIRONMENT_NAME = "production";
    resetForTests();
    expect(service.getUser("u_demo_streamer")).toBeUndefined();
    await ensureDemoSeed(() => {});
    const state = db();
    const ids = new Set(state.users.map((u) => u.id));
    expect(state.challenges.length).toBeGreaterThan(40);
    for (const c of state.challenges) expect(ids.has(c.streamerId)).toBe(true);
    for (const p of state.pledges) expect(ids.has(p.userId)).toBe(true);
    for (const f of state.follows ?? []) expect(ids.has(f.fanId) && ids.has(f.streamerId)).toBe(true);
    expect(needsFreshLive(state)).toBe(false);
  });
});

describe("demo sign-in", () => {
  const env = { NODE_ENV: "production", BREVO_API_KEY: "k", EMAIL_FROM: "a@b.co" };
  const noFetch = (() => {
    throw new Error("no mail should be sent");
  }) as unknown as typeof fetch;

  it("signs into a seeded account with the server's demo code and sends no mail", async () => {
    process.env.POTTED_DEMO_SEED = "on";
    await ensureDemoSeed(() => {});
    process.env.POTTED_DEMO_CODE = "246810";
    await expect(sendCode("Planter@Demo.Potted", { fetch: noFetch, env: { ...env, POTTED_DEMO_CODE: "246810" } })).resolves.toEqual({});
    expect(() => checkCode("planter@demo.potted", "111111")).toThrow("not right");
    expect(checkCode("planter@demo.potted", "246810")).toBe("planter@demo.potted");
    const user = await service.signInWith("email", { subject: "planter@demo.potted", name: "planter", email: "planter@demo.potted" });
    expect(user.id).toBe("u_s_maya");
  });

  it("is closed without a demo code or without the seed", async () => {
    await expect(sendCode("keeper@demo.potted", { fetch: noFetch, env: { ...env, POTTED_DEMO_CODE: "246810" } })).rejects.toThrow("not loaded");
    process.env.POTTED_DEMO_SEED = "on";
    await ensureDemoSeed(() => {});
    await expect(sendCode("keeper@demo.potted", { fetch: noFetch, env })).rejects.toThrow("not set up");
    delete process.env.POTTED_DEMO_CODE;
    expect(() => checkCode("keeper@demo.potted", "246810")).toThrow("not set up");
  });
});
