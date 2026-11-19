import { describe, expect, it, beforeEach } from "vitest";
import { resetTwitchToken, verify } from "../src";
import type { Deps } from "../src";

const MIN = 60_000;
const lockedAt = Date.parse("2026-11-18T18:00:00Z");

function deps(stream: Record<string, unknown> | null): Deps {
  return {
    env: { TWITCH_CLIENT_ID: "id", TWITCH_CLIENT_SECRET: "secret" },
    fetch: (async (url: string) => {
      if (String(url).includes("/token")) return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }));
      return new Response(JSON.stringify({ data: stream ? [stream] : [] }));
    }) as typeof fetch,
  };
}

const live = (startedAt: number, viewers = 40) => ({ id: "b1", user_login: "ryan", started_at: new Date(startedAt).toISOString(), viewer_count: viewers });

describe("twitch adapter", () => {
  beforeEach(() => resetTwitchToken());
  const minutes = { kind: "twitch", channel: "ryan", goal: "live_minutes", count: 60 } as const;
  const viewers = { kind: "twitch", channel: "ryan", goal: "peak_viewers", count: 100 } as const;
  const ctx = (now: number) => ({ lockedAt, deadline: lockedAt + 120 * MIN, now });

  it("counts minutes from the start of the attempt, not the broadcast", async () => {
    const v = await verify(minutes, ctx(lockedAt + 30 * MIN), deps(live(lockedAt - 90 * MIN)));
    expect(v.outcome).toBe("pending");
    const done = await verify(minutes, ctx(lockedAt + 61 * MIN), deps(live(lockedAt - 90 * MIN)));
    expect(done.outcome).toBe("success");
    expect(done.evidence?.source).toBe("twitch");
  });

  it("starts the count again after a restart", async () => {
    const v = await verify(minutes, ctx(lockedAt + 70 * MIN), deps(live(lockedAt + 40 * MIN)));
    expect(v.outcome).toBe("pending");
  });

  it("fails when offline past the deadline", async () => {
    expect((await verify(minutes, ctx(lockedAt + 121 * MIN), deps(null))).outcome).toBe("failure");
    expect((await verify(minutes, ctx(lockedAt + 5 * MIN), deps(null))).outcome).toBe("pending");
  });

  it("succeeds on the first reading at the viewer goal", async () => {
    expect((await verify(viewers, ctx(lockedAt + 5 * MIN), deps(live(lockedAt, 99)))).outcome).toBe("pending");
    expect((await verify(viewers, ctx(lockedAt + 6 * MIN), deps(live(lockedAt, 140)))).outcome).toBe("success");
  });
});
