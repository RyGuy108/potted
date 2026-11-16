import type { SteamCondition, Verdict } from "@potted/core";
import { type Adapter, type Deps, VerifierError, pending } from "./types";

interface Achievement {
  apiname: string;
  achieved: number;
  /** Seconds since the epoch; 0 when not unlocked. */
  unlocktime: number;
}

async function fetchAchievement(c: SteamCondition, deps: Deps): Promise<Achievement> {
  const key = deps.env.STEAM_API_KEY;
  if (!key) throw new VerifierError("STEAM_API_KEY is not set");
  const url = `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key=${encodeURIComponent(key)}&steamid=${c.steamId}&appid=${c.appId}`;
  const res = await deps.fetch(url);
  if (res.status === 403) {
    throw new VerifierError("This Steam profile hides its game details. Set them to public in Steam privacy settings.", 403);
  }
  if (!res.ok) throw new VerifierError(`Steam returned ${res.status}`, res.status);
  const body = (await res.json()) as { playerstats?: { success?: boolean; error?: string; achievements?: Achievement[] } };
  const stats = body.playerstats;
  if (!stats?.success || !stats.achievements) throw new VerifierError(stats?.error ?? "Steam returned no achievements for this game");
  const found = stats.achievements.find((a) => a.apiname.toLowerCase() === c.achievement.toLowerCase());
  if (!found) throw new VerifierError(`${c.gameName} has no achievement named "${c.achievement}"`);
  return found;
}

/**
 * Steam stamps each achievement with its unlock time, so the check is
 * whether that stamp falls inside the attempt. An achievement the streamer
 * already had when the challenge locked can never count.
 */
export const steamAdapter: Adapter<SteamCondition> = {
  kind: "steam",
  async snapshot(c, deps) {
    const before = await fetchAchievement(c, deps);
    return { alreadyUnlocked: before.achieved === 1 };
  },
  async check(c, ctx, deps): Promise<Verdict> {
    const base = ctx.baseline as { alreadyUnlocked: boolean } | undefined;
    if (!base) throw new VerifierError("No baseline was recorded when this challenge locked");
    if (base.alreadyUnlocked) {
      return { outcome: "failure", reason: `"${c.achievementTitle}" was already unlocked before the attempt began` };
    }
    const now = await fetchAchievement(c, deps);
    const unlockedAt = now.unlocktime * 1000;
    if (now.achieved === 1 && unlockedAt >= ctx.lockedAt && unlockedAt <= ctx.deadline) {
      return {
        outcome: "success",
        reason: `Unlocked "${c.achievementTitle}"`,
        evidence: {
          source: "steam",
          ref: `${c.appId}:${now.apiname}:${now.unlocktime}`,
          url: `https://steamcommunity.com/profiles/${c.steamId}/stats/${c.appId}/achievements`,
          summary: `Steam recorded "${c.achievementTitle}" in ${c.gameName} as unlocked at ${new Date(unlockedAt).toISOString()}, during the attempt.`,
        },
      };
    }
    if (now.achieved === 1) {
      return { outcome: "failure", reason: `"${c.achievementTitle}" was unlocked outside the attempt window` };
    }
    if (ctx.now > ctx.deadline) return { outcome: "failure", reason: `Deadline passed without unlocking "${c.achievementTitle}"` };
    return pending(`"${c.achievementTitle}" is not unlocked yet`);
  },
};
