import { parseCondition, type OptimisticClaim } from "@potted/core";
import { describe, expect, it } from "vitest";
import { snapshot, verify } from "../src";
import { isWin, parseBattleTime, type BrawlBattle } from "../src/brawlstars";
import { fakeDeps } from "./helpers";

const LOCKED = Date.parse("2026-11-16T15:00:00.000Z");
const DEADLINE = LOCKED + 60 * 60_000;
const ctx = (now = LOCKED + 10 * 60_000) => ({ lockedAt: LOCKED, deadline: DEADLINE, now });

describe("brawl stars adapter", () => {
  const condition = parseCondition({ kind: "brawlstars", playerTag: "#2pp", wins: 2, battles: 3 });
  const env = { BRAWLSTARS_API_KEY: "test-key" };
  const at = (minutes: number) =>
    new Date(LOCKED + minutes * 60_000).toISOString().replace(/[-:]/g, "");
  const battle = (minutes: number, result: "victory" | "defeat", type = "ranked"): BrawlBattle => ({
    battleTime: at(minutes),
    battle: { mode: "gemGrab", type, result },
  });

  it("parses the compact battle time", () => {
    expect(parseBattleTime("20261116T150402.000Z")).toBe(Date.parse("2026-11-16T15:04:02.000Z"));
  });

  it("treats top-4 solo and top-2 duo Showdown finishes as wins", () => {
    expect(isWin({ battleTime: "", battle: { mode: "soloShowdown", rank: 4 } })).toBe(true);
    expect(isWin({ battleTime: "", battle: { mode: "soloShowdown", rank: 5 } })).toBe(false);
    expect(isWin({ battleTime: "", battle: { mode: "duoShowdown", rank: 3 } })).toBe(false);
  });

  it("succeeds once enough battles are won", async () => {
    const deps = fakeDeps({ items: [battle(6, "victory"), battle(3, "defeat"), battle(9, "victory")] }, { env });
    const verdict = await verify(condition, ctx(), deps);
    expect(verdict.outcome).toBe("success");
    expect(deps.calls[0]!.url).toBe("https://api.brawlstars.com/v1/players/%232PP/battlelog");
    expect(deps.calls[0]!.headers.Authorization).toBe("Bearer test-key");
  });

  it("ignores friendly battles and battles before lock", async () => {
    const items = [battle(-5, "victory"), battle(2, "victory", "friendly"), battle(4, "victory")];
    const verdict = await verify(condition, ctx(), fakeDeps({ items }, { env }));
    expect(verdict.outcome).toBe("pending");
    expect(verdict.reason).toContain("1 of 2 wins");
  });

  it("fails early when the target is out of reach", async () => {
    const items = [battle(2, "defeat"), battle(4, "defeat")];
    expect((await verify(condition, ctx(), fakeDeps({ items }, { env }))).outcome).toBe("failure");
  });

  it("only counts the first N battles", async () => {
    const items = [battle(1, "defeat"), battle(2, "victory"), battle(3, "defeat"), battle(4, "victory")];
    expect((await verify(condition, ctx(), fakeDeps({ items }, { env }))).outcome).toBe("failure");
  });

  it("needs an API key", async () => {
    await expect(verify(condition, ctx(), fakeDeps({ items: [] }))).rejects.toThrow("BRAWLSTARS_API_KEY");
  });
});

describe("fortnite adapter", () => {
  const condition = parseCondition({ kind: "fortnite", accountName: "RyGuy", goal: "wins", count: 1 });
  const env = { FORTNITE_API_KEY: "k" };
  const stats = (wins: number, kills = 100, matches = 50) => ({
    data: { account: { id: "acc1" }, stats: { all: { overall: { wins, kills, matches } } } },
  });

  it("compares totals against the baseline taken at lock", async () => {
    const baseline = await snapshot(condition, fakeDeps(stats(10), { env }));
    expect(baseline).toMatchObject({ accountId: "acc1", wins: 10 });

    const same = await verify(condition, { ...ctx(), baseline }, fakeDeps(stats(10), { env }));
    expect(same.outcome).toBe("pending");

    const won = await verify(condition, { ...ctx(), baseline }, fakeDeps(stats(11, 108, 52), { env }));
    expect(won.outcome).toBe("success");
    expect(won.evidence?.ref).toBe("acc1:wins:10->11");
  });

  it("fails at the deadline and explains private stats", async () => {
    const baseline = await snapshot(condition, fakeDeps(stats(10), { env }));
    const late = await verify(condition, { ...ctx(DEADLINE + 1), baseline }, fakeDeps(stats(10), { env }));
    expect(late.outcome).toBe("failure");
    await expect(snapshot(condition, fakeDeps({}, { env, status: 403 }))).rejects.toThrow("private stats");
  });
});

describe("optimistic adapter", () => {
  const condition = parseCondition({
    kind: "optimistic",
    game: "GTA IV",
    statement: "Finish Three Leaf Clover without dying",
    disputeWindowSecs: 120,
  });
  const claim = (over: Partial<OptimisticClaim> = {}): OptimisticClaim => ({
    clipUrl: "https://clips.example/abc",
    claimedAt: LOCKED + 5 * 60_000,
    disputedBy: [],
    ...over,
  });
  const deps = fakeDeps({});

  it("waits for a claim, then for the dispute window", async () => {
    expect((await verify(condition, ctx(), deps)).outcome).toBe("pending");
    const open = await verify(condition, { ...ctx(LOCKED + 6 * 60_000), claim: claim() }, deps);
    expect(open.outcome).toBe("pending");
    const settled = await verify(condition, { ...ctx(LOCKED + 7 * 60_000), claim: claim() }, deps);
    expect(settled.outcome).toBe("success");
    expect(settled.evidence?.url).toBe("https://clips.example/abc");
  });

  it("holds settlement while disputed and follows the moderator's ruling", async () => {
    const now = ctx(LOCKED + 30 * 60_000);
    const disputed = claim({ disputedBy: ["fan1"] });
    expect((await verify(condition, { ...now, claim: disputed }, deps)).outcome).toBe("pending");
    expect((await verify(condition, { ...now, claim: { ...disputed, ruling: "rejected" } }, deps)).outcome).toBe("failure");
    expect((await verify(condition, { ...now, claim: { ...disputed, ruling: "upheld" } }, deps)).outcome).toBe("success");
  });

  it("fails when no claim arrives before the deadline", async () => {
    expect((await verify(condition, ctx(DEADLINE + 1), deps)).outcome).toBe("failure");
  });
});
