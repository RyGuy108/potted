import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { base58, decodeLogs, discriminator, parseDelivery, verifySignature } from "../src/index";

const PROGRAM = "2ppLCjxK534szs3T9o1vw3wW4gD9C6s2Dg5Coe2tqgNV";
const OTHER = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const key = (fill: number) => Buffer.alloc(32, fill);
const u64 = (n: number) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
};
const data = (name: string, ...parts: Buffer[]) => `Program data: ${Buffer.concat([discriminator(name), ...parts]).toString("base64")}`;
const inProgram = (id: string, ...lines: string[]) => [`Program ${id} invoke [1]`, ...lines, `Program ${id} success`];

const pledged = data("Pledged", key(1), key(2), u64(5_000_000), u64(12_000_000));
const text = Buffer.from("lichess:abc123");
const len = Buffer.alloc(4);
len.writeUInt32LE(text.length);
const settled = data("Settled", key(1), Buffer.from([1]), u64(12_000_000), len, text);

describe("base58", () => {
  it("matches Solana's encoding, including leading zeros", () => {
    expect(base58(Buffer.alloc(32, 0))).toBe("11111111111111111111111111111111");
    expect(base58(Buffer.from("hello world"))).toBe("StV1DL6CwTryKyV");
  });
});

describe("decoding program logs", () => {
  it("decodes each event's fields", () => {
    const events = decodeLogs(inProgram(PROGRAM, "Program log: Instruction: Pledge", pledged, settled), PROGRAM);
    expect(events).toEqual([
      { name: "Pledged", challenge: base58(key(1)), fields: { challenge: base58(key(1)), fan: base58(key(2)), amount: 5_000_000, totalPledged: 12_000_000 } },
      { name: "Settled", challenge: base58(key(1)), fields: { challenge: base58(key(1)), success: true, paidOut: 12_000_000, evidenceRef: "lichess:abc123" } },
    ]);
  });

  it("ignores events logged by any other program, including one our program called", () => {
    expect(decodeLogs(inProgram(OTHER, pledged), PROGRAM)).toEqual([]);
    const nested = [`Program ${PROGRAM} invoke [1]`, `Program ${OTHER} invoke [2]`, settled, `Program ${OTHER} success`, pledged, `Program ${PROGRAM} success`];
    expect(decodeLogs(nested, PROGRAM).map((e) => e.name)).toEqual(["Pledged"]);
  });

  it("skips unknown and truncated data", () => {
    const truncated = `Program data: ${Buffer.concat([discriminator("Pledged"), key(1)]).toString("base64")}`;
    expect(decodeLogs(inProgram(PROGRAM, data("SomethingElse", key(1)), truncated, "Program data: !!!"), PROGRAM)).toEqual([]);
  });
});

describe("QuickNode deliveries", () => {
  it("accepts a signature made with the stream's token and nothing else", () => {
    const body = '{"data":[]}';
    const signature = createHmac("sha256", "token").update("n1" + "1700000000" + body).digest("hex");
    const base = { secret: "token", nonce: "n1", timestamp: "1700000000", body, signature };
    expect(verifySignature(base)).toBe(true);
    expect(verifySignature({ ...base, body: '{"data":[1]}' })).toBe(false);
    expect(verifySignature({ ...base, secret: "other" })).toBe(false);
    expect(verifySignature({ ...base, signature: "zz" })).toBe(false);
    expect(verifySignature({ ...base, secret: "" })).toBe(false);
  });

  it("reads our filter's shape and raw transactions, and skips failed ones", () => {
    const compact = { data: [{ signature: "sigA", slot: 7, blockTime: 1_800_000_000, logs: inProgram(PROGRAM, pledged, settled) }] };
    expect(parseDelivery(compact, PROGRAM).map((e) => [e.key, e.name, e.slot, e.at])).toEqual([
      ["sigA:0", "Pledged", 7, 1_800_000_000_000],
      ["sigA:1", "Settled", 7, 1_800_000_000_000],
    ]);
    const raw = [{ slot: 9, blockTime: 5, transactions: [
      { transaction: { signatures: ["sigB"] }, meta: { err: null, logMessages: inProgram(PROGRAM, pledged) } },
      { transaction: { signatures: ["sigC"] }, meta: { err: { InstructionError: [0, "Custom"] }, logMessages: inProgram(PROGRAM, pledged) } },
    ] }];
    expect(parseDelivery(raw, PROGRAM).map((e) => [e.key, e.slot])).toEqual([["sigB:0", 9]]);
    expect(parseDelivery("nonsense", PROGRAM)).toEqual([]);
  });
});
