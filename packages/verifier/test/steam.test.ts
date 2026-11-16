import type { SteamCondition } from "@potted/core";
import { describe, expect, it } from "vitest";
import { steamAdapter } from "../src/steam";
import type { Deps } from "../src/types";

const condition: SteamCondition = { kind: "steam", steamId: "76561198000000000", appId: 367520, gameName: "Hollow Knight", achievement: "STEEL_SOUL", achievementTitle: "Steel Soul" };
const lockedAt = 1_800_000_000_000;
const ctx = (now: number, alreadyUnlocked = false) => ({ lockedAt, deadline: lockedAt + 3_600_000, now, baseline: { alreadyUnlocked } });

function steam(achieved: number, unlockMs = 0, status = 200): Deps & { urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    env: { STEAM_API_KEY: "key" },
    fetch: (async (url: string) => {
      urls.push(url);
      const achievements = [{ apiname: "OTHER", achieved: 1, unlocktime: 5 }, { apiname: "STEEL_SOUL", achieved, unlocktime: Math.floor(unlockMs / 1000) }];
      return new Response(JSON.stringify({ playerstats: { success: true, achievements } }), { status });
    }) as typeof fetch,
  };
}

describe("steam adapter", () => {
  it("records at lock whether the achievement was already unlocked", async () => {
    expect(await steamAdapter.snapshot!(condition, steam(0))).toEqual({ alreadyUnlocked: false });
    expect(await steamAdapter.snapshot!(condition, steam(1, lockedAt - 1000))).toEqual({ alreadyUnlocked: true });
  });

  it("succeeds when Steam stamps the unlock inside the attempt", async () => {
    const deps = steam(1, lockedAt + 60_000);
    const verdict = await steamAdapter.check(condition, ctx(lockedAt + 90_000), deps);
    expect(verdict.outcome).toBe("success");
    expect(verdict.evidence).toMatchObject({ source: "steam", ref: `367520:STEEL_SOUL:${(lockedAt + 60_000) / 1000}` });
    expect(deps.urls[0]).toContain("steamid=76561198000000000&appid=367520");
  });

  it("waits while locked, and fails at the deadline", async () => {
    expect((await steamAdapter.check(condition, ctx(lockedAt + 1000), steam(0))).outcome).toBe("pending");
    expect((await steamAdapter.check(condition, ctx(lockedAt + 3_600_001), steam(0))).outcome).toBe("failure");
  });

  it("never pays for an unlock from before the attempt or after the deadline", async () => {
    expect((await steamAdapter.check(condition, ctx(lockedAt + 1000, true), steam(1, lockedAt - 5000))).reason).toContain("already unlocked");
    expect((await steamAdapter.check(condition, ctx(lockedAt + 4_000_000), steam(1, lockedAt + 3_700_000))).reason).toContain("outside the attempt window");
  });

  it("explains private profiles, unknown achievements and a missing key", async () => {
    await expect(steamAdapter.check(condition, ctx(lockedAt + 1), steam(0, 0, 403))).rejects.toThrow("privacy settings");
    await expect(steamAdapter.check({ ...condition, achievement: "NOPE" }, ctx(lockedAt + 1), steam(0))).rejects.toThrow('no achievement named "NOPE"');
    await expect(steamAdapter.check(condition, ctx(lockedAt + 1), { ...steam(0), env: {} })).rejects.toThrow("STEAM_API_KEY");
  });
});
