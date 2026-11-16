import { describe, expect, it } from "vitest";
import { type Deps, disputeBrief, draftTerms } from "../src/index";

const noKey: Deps = { fetch: () => Promise.reject(new Error("no network in tests")), env: {} };

function grok(content: string, status = 200): Deps & { calls: { url: string; body: any; auth: string }[] } {
  const calls: { url: string; body: any; auth: string }[] = [];
  return {
    calls,
    env: { XAI_API_KEY: "test-key" },
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)), auth: (init.headers as Record<string, string>).Authorization! });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
    }) as typeof fetch,
  };
}

describe("drafting terms with rules", () => {
  it("reads speed and rating for chess", async () => {
    const draft = await draftTerms({ gameId: "chess", text: "Beat an 1800 in bullet" }, noKey);
    expect(draft).toMatchObject({ source: "rules", fields: { speed: "bullet", minOpponentRating: "1800" } });
  });

  it("reads wins out of battles for Brawl Stars", async () => {
    expect((await draftTerms({ gameId: "brawlstars", text: "win 3 of the next 5" }, noKey)).fields).toEqual({ wins: "3", battles: "5" });
    expect((await draftTerms({ gameId: "brawlstars", text: "4 wins in a row" }, noKey)).fields).toEqual({ wins: "4", battles: "4" });
    expect((await draftTerms({ gameId: "brawlstars", text: "win 9 of 5" }, noKey)).fields).toEqual({ wins: "9", battles: "9" });
  });

  it("reads kills or wins for Fortnite", async () => {
    expect((await draftTerms({ gameId: "fortnite", text: "drop 12 elims tonight" }, noKey)).fields).toEqual({ goal: "kills", count: "12" });
    expect((await draftTerms({ gameId: "fortnite", text: "get a victory royale" }, noKey)).fields).toEqual({ goal: "wins", count: "1" });
  });

  it("tidies a clip statement and says when nothing could be read", async () => {
    const gta = await draftTerms({ gameId: "gta6", text: "  finish the first heist   without getting busted. " }, noKey);
    expect(gta.fields).toEqual({ statement: "Finish the first heist without getting busted" });
    const vague = await draftTerms({ gameId: "chess", text: "do something cool" }, noKey);
    expect(vague.fields).toEqual({});
    expect(vague.note).toContain("Set the terms yourself");
  });
});

describe("drafting terms with Grok", () => {
  it("uses Grok's fields after checking them, and never account names or money", async () => {
    const deps = grok('Sure! {"fields": {"speed": "blitz", "minOpponentRating": 2000, "username": "hacker", "goalUsd": 9999}, "note": "Set a 2000 floor."}');
    const draft = await draftTerms({ gameId: "chess", text: "beat a strong player at blitz" }, deps);
    expect(draft).toEqual({ gameId: "chess", fields: { speed: "blitz", minOpponentRating: "2000" }, note: "Set a 2000 floor.", source: "grok" });
    expect(deps.calls[0]).toMatchObject({ url: "https://api.x.ai/v1/chat/completions", auth: "Bearer test-key" });
    expect(deps.calls[0]!.body.messages[1].content).toContain("beat a strong player at blitz");
  });

  it("drops out-of-range values and fixes wins above battles", async () => {
    const chess = await draftTerms({ gameId: "chess", text: "beat a 9000 in hyperbullet" }, grok('{"fields": {"speed": "hyperbullet", "minOpponentRating": 9000}}'));
    expect(chess.source).toBe("rules");
    const brawl = await draftTerms({ gameId: "brawlstars", text: "win lots" }, grok('{"fields": {"wins": 6, "battles": 4}, "note": "ok"}'));
    expect(brawl.fields).toEqual({ wins: "6", battles: "6" });
  });

  it("falls back to rules when Grok errors or replies with nonsense", async () => {
    const idea = { gameId: "fortnite", text: "get 10 kills" };
    for (const deps of [grok("{}", 500), grok("I cannot help with that"), { ...noKey, env: { XAI_API_KEY: "k" } }]) {
      expect(await draftTerms(idea, deps)).toMatchObject({ source: "rules", fields: { goal: "kills", count: "10" } });
    }
  });
});

describe("dispute brief", () => {
  const dispute = { title: "GTA VI: No busts", statement: "Finish the heist without getting busted", game: "GTA VI", disputes: 2, funders: 5 };

  it("gives fixed checks without a key", async () => {
    const brief = await disputeBrief(dispute, noKey);
    expect(brief.source).toBe("rules");
    expect(brief.points[0]).toContain("Finish the heist without getting busted");
    expect(brief.points[3]).toContain("2 of 5 funders disputed");
  });

  it("uses Grok's points and adds the dispute count from our own records", async () => {
    const brief = await disputeBrief(dispute, grok('{"points": ["Wanted level never ends in an arrest", "Mission passed screen is visible"], "ruling": "uphold"}'));
    expect(brief).toMatchObject({ source: "grok" });
    expect(brief.points).toHaveLength(3);
    expect(brief.points[2]).toContain("2 of 5 funders disputed");
    expect(JSON.stringify(brief)).not.toContain("uphold");
  });
});
