import { describe, expect, it } from "vitest";
import { type ScoutInput, checkPitch, scout } from "../src";

const input: ScoutInput = {
  climber: "Ryan",
  games: [
    { id: "gta6", challenges: 6, completed: 4, averagePotUsd: 32, minutesToGoal: 14, accountKnown: true },
    { id: "fortnite", challenges: 3, completed: 1, averagePotUsd: 18, minutesToGoal: null, accountKnown: true },
    { id: "chess", challenges: 0, completed: 0, averagePotUsd: 0, minutesToGoal: null, accountKnown: false },
  ],
  recent: ["GTA VI: Finish the first heist without getting busted"],
  fanIdeas: [{ gameId: "gta6", text: "Win a street race without hitting a wall" }],
  chain: { pledges: 12, pledgedUsd: 84, settled: 3, paidOutUsd: 60, biggestPotUsd: 40 },
  limits: { maxGoalUsd: 60 },
  today: "2026-11-18",
};

function grok(reply: unknown, extra: Record<string, unknown> = {}) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  return {
    calls,
    deps: {
      env: { XAI_API_KEY: "k" },
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return new Response(
          JSON.stringify({
            output: [
              { type: "custom_tool_call", name: "x_keyword_search" },
              { type: "message", content: [{ type: "output_text", text: "```json\n" + JSON.stringify(reply) + "\n```", annotations: [{ url: "https://x.com/someone/status/1" }] }] },
            ],
            usage: { server_side_tool_usage_details: { x_posts_fetched: 37 } },
            ...extra,
          }),
        );
      }) as typeof fetch,
    },
  };
}

describe("scout", () => {
  it("asks Grok with X and web search and keeps only pitches the app can run", async () => {
    const { deps, calls } = grok({
      summary: "Heist runs are trending this week.",
      pitches: [
        { gameId: "gta6", statement: "Rob the Vice City jewelry store with no wanted stars", goalUsd: 500, capUsd: 900, minutes: 5, upfrontPct: 33, why: "Clips of the jewelry heist are everywhere.", hook: "Jewelry heist, zero stars. #GTA6 https://spam.example", sources: ["https://x.com/someone/status/1", "https://made-up.example/post"] },
        { gameId: "fortnite", fields: { goal: "kills", count: 12, accountName: "someone-else" }, goalUsd: 30, capUsd: 10, minutes: 45, upfrontPct: 25, why: "x", hook: "12 elims tonight." },
        { gameId: "chess", fields: { speed: "blitz" }, goalUsd: 20 },
        { gameId: "minecraft", statement: "Beat the dragon", goalUsd: 20 },
        { gameId: "other", game: "Hollow Knight: Silksong", statement: "Beat the first boss without taking damage", goalUsd: 25, capUsd: 10, minutes: 60 },
        { gameId: "gta6", statement: "a or b", goalUsd: 10 },
      ],
    });
    const result = await scout(input, deps);
    expect(calls[0]!.url).toBe("https://api.x.ai/v1/responses");
    expect((calls[0]!.body.tools as { type: string }[]).map((t) => t.type)).toEqual(["x_search", "web_search"]);
    expect(result.source).toBe("grok");
    expect(result.postsRead).toBe(37);
    expect(result.pitches.map((p) => p.gameId)).toEqual(["gta6", "fortnite", "other"]);
    const [heist, fortnite, other] = result.pitches;
    // Clamped to the climber's limit and to sane terms.
    expect(heist).toMatchObject({ goalUsd: 60, capUsd: 60, minutes: 15, upfrontPct: 0 });
    expect(heist!.hook).toBe("Jewelry heist, zero stars.");
    // Only URLs the search actually returned survive.
    expect(heist!.sources).toEqual([{ url: "https://x.com/someone/status/1" }]);
    // Account names never come from the model.
    expect(fortnite!.fields).toEqual({ goal: "kills", count: "12" });
    expect(other!.fields.game).toBe("Hollow Knight: Silksong");
  });

  it("falls back to the climber's record and says why", async () => {
    const failing = { env: { XAI_API_KEY: "k" }, fetch: (async () => new Response("no", { status: 401 })) as typeof fetch };
    const result = await scout(input, failing);
    expect(result.source).toBe("rules");
    expect(result.fallback).toBe("Grok rejected the API key");
    expect(result.pitches.length).toBeGreaterThan(0);
    expect(result.pitches[0]!.why).toContain("planter");
    expect(result.summary).toContain("12 pledges");

    const noKey = await scout(input, { env: {}, fetch: globalThis.fetch });
    expect(noKey.fallback).toBeUndefined();
  });

  it("rejects pitches for games the climber has no account for", () => {
    expect(checkPitch({ gameId: "chess", fields: { speed: "blitz" } }, input, [])).toBeUndefined();
    expect(checkPitch({ gameId: "nope", statement: "something long enough" }, input, [])).toBeUndefined();
  });
});
