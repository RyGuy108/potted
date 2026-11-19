import { describe, expect, it } from "vitest";
import { type Deps, type PledgeFacts, commentByRules, commentOnPledge } from "../src/index";

const facts: PledgeFacts = {
  planter: "Ana Ruiz",
  streamer: "Ryan",
  title: "Win a rated bullet game",
  amount: "$5.00",
  pot: "$15.00",
  goal: "$20.00",
  toGo: "$5.00",
  planters: 3,
  planterPledgesTonight: 1,
  firstOnChallenge: false,
  biggestOnChallenge: false,
};

const grok = (text: string): Deps & { model?: string } => {
  const deps: Deps & { model?: string } = {
    env: { XAI_API_KEY: "k", XAI_COMMENTARY_MODEL: "grok-fast" },
    fetch: (async (_url: string, init: RequestInit) => {
      deps.model = JSON.parse(String(init.body)).model;
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ text }) } }] }));
    }) as typeof fetch,
  };
  return deps;
};

describe("overlay commentary", () => {
  it("picks what makes a pledge notable, or says nothing", () => {
    expect(commentByRules({ ...facts, firstOnChallenge: true })).toBe("Ana plants the very first bean on this one.");
    expect(commentByRules({ ...facts, biggestOnChallenge: true })).toMatch(/biggest pledge/);
    expect(commentByRules({ ...facts, minutesLeft: 3 })).toBe("Only $5.00 to go, with 3 minutes on the clock.");
    expect(commentByRules({ ...facts, planterPledgesTonight: 3 })).toMatch(/pledge number 3/);
    expect(commentByRules({ ...facts, toGo: undefined })).toBeUndefined();
  });

  it("uses Grok's line, with the commentary model, when it passes the checks", async () => {
    const deps = grok("Ana is not letting this one slip, $5.00 closer to the goal!");
    expect(await commentOnPledge(facts, deps)).toEqual({ text: "Ana is not letting this one slip, $5.00 closer to the goal!", source: "grok" });
    expect(deps.model).toBe("grok-fast");
  });

  it("falls back to the fixed aside when Grok invents a figure, links, or rambles", async () => {
    for (const bad of ["Ana throws in $50.00!", "Back it at https://x.co now", "@ryan look at this", "x".repeat(140)]) {
      expect(await commentOnPledge(facts, grok(bad))).toEqual({ text: "Only $5.00 left until the $20.00 goal.", source: "rules" });
    }
  });

  it("works with no key", async () => {
    expect(await commentOnPledge({ ...facts, firstOnChallenge: true }, { env: {}, fetch: (() => { throw new Error("no"); }) as typeof fetch })).toEqual({
      text: "Ana plants the very first bean on this one.",
      source: "rules",
    });
  });
});
