import type { TwitchCondition, Verdict } from "@potted/core";
import { type Adapter, type CheckContext, type Deps, VerifierError, pending } from "./types";

/** The fields read from Twitch's Get Streams endpoint. */
export interface TwitchStream {
  id: string;
  user_login: string;
  started_at: string;
  viewer_count: number;
  game_name?: string;
  title?: string;
}

const api = (deps: Deps) => deps.env.TWITCH_API_BASE ?? "https://api.twitch.tv/helix";
const auth = (deps: Deps) => deps.env.TWITCH_AUTH_BASE ?? "https://id.twitch.tv/oauth2";

let token: { value: string; until: number } | undefined;

async function appToken(deps: Deps): Promise<string> {
  if (token && token.until > Date.now()) return token.value;
  const id = deps.env.TWITCH_CLIENT_ID;
  const secret = deps.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) throw new VerifierError("TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET are not set");
  const res = await deps.fetch(`${auth(deps)}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new VerifierError(`Twitch token request returned ${res.status}`, res.status);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: body.access_token, until: Date.now() + Math.max(60, body.expires_in - 60) * 1000 };
  return token.value;
}

/** Test hook. */
export function resetTwitchToken(): void {
  token = undefined;
}

/** The channel's current broadcast, or null when it is offline. */
export async function liveStream(channel: string, deps: Deps): Promise<TwitchStream | null> {
  const res = await deps.fetch(`${api(deps)}/streams?user_login=${encodeURIComponent(channel)}`, {
    headers: { "Client-Id": deps.env.TWITCH_CLIENT_ID ?? "", Authorization: `Bearer ${await appToken(deps)}` },
  });
  if (res.status === 401) resetTwitchToken();
  if (res.status === 429) throw new VerifierError("Twitch rate limit hit; try again in a minute", 429);
  if (!res.ok) throw new VerifierError(`Twitch returned ${res.status}`, res.status);
  const body = (await res.json()) as { data: TwitchStream[] };
  return body.data[0] ?? null;
}

/**
 * Twitch only reports the stream as it is right now, so this is checked
 * repeatedly while the attempt runs (the coordinator polls every few
 * seconds). "Live for N minutes" counts from the later of the broadcast's
 * start and the attempt's start; a restart begins a new broadcast and the
 * count starts over. "Peak viewers" succeeds on the first reading at or
 * above the goal.
 */
export const twitchAdapter: Adapter<TwitchCondition> = {
  kind: "twitch",
  async check(c, ctx: CheckContext, deps): Promise<Verdict> {
    const stream = await liveStream(c.channel, deps);
    const url = `https://www.twitch.tv/${c.channel}`;
    if (stream) {
      const startedAt = Date.parse(stream.started_at);
      if (c.goal === "live_minutes") {
        const from = Math.max(startedAt, ctx.lockedAt);
        const minutes = Math.floor((Math.min(ctx.now, ctx.deadline) - from) / 60_000);
        if (minutes >= c.count) {
          return {
            outcome: "success",
            reason: `${c.channel} has been live for ${minutes} minutes straight`,
            evidence: {
              source: "twitch",
              ref: stream.id,
              url,
              summary: `Twitch reported broadcast ${stream.id} live since ${new Date(startedAt).toISOString()}; ${minutes} minutes of it fell inside the attempt.`,
            },
          };
        }
        if (ctx.now > ctx.deadline) return { outcome: "failure", reason: `Only ${Math.max(0, minutes)} of ${c.count} minutes before the deadline` };
        return pending(`Live for ${Math.max(0, minutes)} of ${c.count} minutes`);
      }
      if (ctx.now <= ctx.deadline && startedAt <= ctx.now && stream.viewer_count >= c.count) {
        return {
          outcome: "success",
          reason: `${stream.viewer_count.toLocaleString("en-US")} people watching`,
          evidence: {
            source: "twitch",
            ref: stream.id,
            url,
            summary: `Twitch reported ${stream.viewer_count.toLocaleString("en-US")} concurrent viewers on broadcast ${stream.id} at ${new Date(ctx.now).toISOString()}.`,
          },
        };
      }
      if (ctx.now > ctx.deadline) return { outcome: "failure", reason: `Did not reach ${c.count} viewers before the deadline` };
      return pending(`${stream.viewer_count.toLocaleString("en-US")} of ${c.count.toLocaleString("en-US")} viewers`);
    }
    if (ctx.now > ctx.deadline) return { outcome: "failure", reason: `${c.channel} was not live long enough before the deadline` };
    return pending(`${c.channel} is offline`);
  },
};
