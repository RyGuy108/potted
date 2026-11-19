import { parseCondition, type LichessCondition } from "@potted/core";
import { describe, expect, it } from "vitest";
import { VerifierError, verify } from "../src";
import type { LichessGame } from "../src/lichess";
import { fakeDeps } from "./helpers";

const LOCKED = 1_000_000;
const DEADLINE = LOCKED + 60 * 60_000;
const condition = parseCondition({ kind: "lichess", username: "Ryan", speed: "bullet" }) as LichessCondition;
const MOVES = Array.from({ length: 40 }, (_, i) => `m${i}`).join(" ");

function game(over: Partial<LichessGame> = {}): LichessGame {
  return {
    id: "abc12345",
    rated: true,
    variant: "standard",
    speed: "bullet",
    source: "pool",
    status: "mate",
    createdAt: LOCKED + 5_000,
    lastMoveAt: LOCKED + 125_000,
    winner: "white",
    moves: MOVES,
    players: {
      white: { user: { name: "ryan" }, rating: 1800 },
      black: { user: { name: "Opponent" }, rating: 1790 },
    },
    ...over,
  };
}

const ndjson = (...games: LichessGame[]) => games.map((g) => JSON.stringify(g)).join("\n") + "\n";
const ctx = (now = LOCKED + 300_000) => ({ lockedAt: LOCKED, deadline: DEADLINE, now });

describe("lichess adapter", () => {
  it("pays out on a matchmade win and links the game as evidence", async () => {
    const deps = fakeDeps(ndjson(game()));
    const verdict = await verify(condition, ctx(), deps);
    expect(verdict.outcome).toBe("success");
    expect(verdict.evidence).toMatchObject({ ref: "abc12345", url: "https://lichess.org/abc12345" });
    expect(deps.calls[0]!.url).toContain("/api/games/user/Ryan?");
    expect(deps.calls[0]!.url).toContain(`since=${LOCKED}`);
    expect(deps.calls[0]!.url).toContain("perfType=bullet");
  });

  it("fails on a loss, and a draw is not a win", async () => {
    expect((await verify(condition, ctx(), fakeDeps(ndjson(game({ winner: "black" }))))).outcome).toBe("failure");
    const draw = await verify(condition, ctx(), fakeDeps(ndjson(game({ winner: undefined, status: "draw" }))));
    expect(draw.outcome).toBe("failure");
    expect(draw.reason).toContain("drew");
  });

  it("ignores a win handed over by a friend through a direct challenge", async () => {
    const verdict = await verify(condition, ctx(), fakeDeps(ndjson(game({ source: "friend" }))));
    expect(verdict.outcome).toBe("pending");
    expect(verdict.reason).toContain("1 ignored");
  });

  it("ignores early resignations, aborts, casual and wrong-speed games", async () => {
    const skipped = [
      game({ id: "g1", moves: "e4 e5 Qh5", status: "resign" }),
      game({ id: "g2", status: "aborted" }),
      game({ id: "g3", rated: false }),
      game({ id: "g4", speed: "blitz" }),
    ];
    const verdict = await verify(condition, ctx(), fakeDeps(ndjson(...skipped)));
    expect(verdict.outcome).toBe("pending");
  });

  it("uses the first eligible game, not a later win", async () => {
    const loss = game({ id: "first", winner: "black", createdAt: LOCKED + 1_000 });
    const win = game({ id: "second", createdAt: LOCKED + 200_000, lastMoveAt: LOCKED + 260_000 });
    const verdict = await verify(condition, ctx(), fakeDeps(ndjson(win, loss)));
    expect(verdict.outcome).toBe("failure");
    expect(verdict.evidence?.ref).toBe("first");
  });

  it("applies the opponent rating floor", async () => {
    const strict = { ...condition, minOpponentRating: 2000 };
    expect((await verify(strict, ctx(), fakeDeps(ndjson(game())))).outcome).toBe("pending");
  });

  it("does not count a game that finished after the deadline", async () => {
    const late = game({ lastMoveAt: DEADLINE + 1 });
    expect((await verify(condition, ctx(DEADLINE + 5_000), fakeDeps(ndjson(late)))).outcome).toBe("failure");
  });

  it("stays pending before the deadline and fails after it with no games", async () => {
    expect((await verify(condition, ctx(), fakeDeps(""))).outcome).toBe("pending");
    expect((await verify(condition, ctx(DEADLINE + 1), fakeDeps(""))).outcome).toBe("failure");
  });

  it("reports an unknown user clearly", async () => {
    await expect(verify(condition, ctx(), fakeDeps("", { status: 404 }))).rejects.toThrow(VerifierError);
  });
});
