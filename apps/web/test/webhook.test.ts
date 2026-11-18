import { createHmac } from "node:crypto";
import { gzipSync } from "node:zlib";
import { discriminator } from "@potted/chain";
import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "../src/app/api/webhooks/quicknode/route";
import { chainEvents } from "../src/lib/chain";
import * as service from "../src/lib/service";
import { DEMO_STREAMER_ID, resetForTests } from "../src/lib/store";

const CHESS = { gameId: "chess", condition: { kind: "lichess", username: "ryan", speed: "bullet" }, goalUsd: 20, pledgeCapUsd: 15, minutes: 30 };
const PROGRAM = "2ppLCjxK534szs3T9o1vw3wW4gD9C6s2Dg5Coe2tqgNV";
const SECRET = "stream-token";
const amount = Buffer.alloc(8);
amount.writeBigUInt64LE(3_000_000n);
const upfront = Buffer.alloc(8);
upfront.writeBigUInt64LE(1_500_000n);
const locked = `Program data: ${Buffer.concat([discriminator("Locked"), Buffer.alloc(32, 7), amount, upfront]).toString("base64")}`;
const delivery = JSON.stringify({ data: [{ signature: "sig1", slot: 42, blockTime: 1_800_000_000, logs: [`Program ${PROGRAM} invoke [1]`, locked, `Program ${PROGRAM} success`] }] });

function post(body: string, options: { secret?: string; gzip?: boolean } = {}) {
  const signature = createHmac("sha256", options.secret ?? SECRET).update("nonce" + "123" + body).digest("hex");
  return POST(
    new Request("http://localhost/api/webhooks/quicknode", {
      method: "POST",
      headers: { "x-qn-nonce": "nonce", "x-qn-timestamp": "123", "x-qn-signature": signature },
      body: options.gzip ? gzipSync(body) : body,
    }),
  );
}

describe("QuickNode webhook", () => {
  beforeEach(() => {
    resetForTests();
    process.env.QUICKNODE_WEBHOOK_SECRET = SECRET;
    process.env.POTTED_PROGRAM_ID = PROGRAM;
  });

  it("stores signed events once, plain or gzipped", async () => {
    expect(await (await post(delivery)).json()).toEqual({ decoded: 1, stored: 1, shown: 0, booked: 0 });
    expect(await (await post(delivery, { gzip: true })).json()).toEqual({ decoded: 1, stored: 0, shown: 0, booked: 0 });
    expect(chainEvents()).toMatchObject([{ key: "sig1:0", name: "Locked", slot: 42, fields: { totalPledged: 3_000_000, upfrontPaid: 1_500_000 } }]);
  });

  it("rejects a wrong signature and refuses to run unconfigured", async () => {
    expect((await post(delivery, { secret: "guess" })).status).toBe(401);
    expect(chainEvents()).toEqual([]);
    delete process.env.QUICKNODE_WEBHOOK_SECRET;
    expect((await post(delivery)).status).toBe(503);
  });
});

describe("pledges carried by the QuickNode Stream", () => {
  beforeEach(() => {
    resetForTests();
    process.env.QUICKNODE_WEBHOOK_SECRET = SECRET;
    process.env.POTTED_PROGRAM_ID = PROGRAM;
  });

  const FAN = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
  /** A Stream delivery holding one Pledged event for this challenge account. */
  function pledged(signature: string, challengeAccount: Buffer, fan: Buffer, micro: bigint, total: bigint) {
    const a = Buffer.alloc(8);
    a.writeBigUInt64LE(micro);
    const t = Buffer.alloc(8);
    t.writeBigUInt64LE(total);
    const data = `Program data: ${Buffer.concat([discriminator("Pledged"), challengeAccount, fan, a, t]).toString("base64")}`;
    return JSON.stringify([{ signature, slot: 7, blockTime: Math.floor(Date.now() / 1000), logs: [`Program ${PROGRAM} invoke [1]`, data, `Program ${PROGRAM} success`] }]);
  }

  it("books a wallet pledge once, whether the wallet or the Stream reports it first, and shows its speed", async () => {
    const c = await service.createChallenge(service.getUser(DEMO_STREAMER_ID)!, CHESS);
    const account = service.chainAccountOf(c.ledgerRef!);
    const before = service.latestSeq();

    // The wallet's confirmation call arrives first: the line waits for the Stream.
    expect(service.recordWalletPledge({ challengeAccount: account, wallet: FAN, amountMicro: 4_000_000, signature: "sigA", confirmedAt: Date.now() })).toBeDefined();
    expect(service.eventsSince("ryan", before)).toEqual([]);
    expect(service.getChallenge(c.id).totalMicro).toBe(4_000_000);

    // The Stream delivers it: no second booking, and the line goes up stamped with when it arrived.
    service.releaseChainEvents("sigA");
    const [line] = service.eventsSince("ryan", before);
    expect(line).toMatchObject({ type: "pledged", chain: { signature: "sigA" } });
    expect(line!.chain!.streamAt).toBeGreaterThanOrEqual(line!.chain!.confirmedAt);
    expect(service.recordWalletPledge({ challengeAccount: account, wallet: FAN, amountMicro: 4_000_000, signature: "sigA", confirmedAt: Date.now() })).toBeUndefined();
    expect(service.getChallenge(c.id).totalMicro).toBe(4_000_000);
  });

  it("puts a held line on screen anyway when the Stream is late", async () => {
    const c = await service.createChallenge(service.getUser(DEMO_STREAMER_ID)!, CHESS);
    const before = service.latestSeq();
    service.recordWalletPledge({ challengeAccount: service.chainAccountOf(c.ledgerRef!), wallet: FAN, amountMicro: 2_000_000, signature: "sigB", confirmedAt: Date.now() });
    service.releaseStaleEvents(Date.now() + service.HOLD_MS);
    const [line] = service.eventsSince("ryan", before);
    expect(line!.chain!.streamAt).toBeUndefined();
  });

  it("names a new wallet planter by its address and refuses a streamer's wallet", async () => {
    const c = await service.createChallenge(service.getUser(DEMO_STREAMER_ID)!, CHESS);
    service.recordWalletPledge({ challengeAccount: service.chainAccountOf(c.ledgerRef!), wallet: FAN, amountMicro: 1_000_000, signature: "sigC", confirmedAt: Date.now(), streamAt: Date.now() });
    expect(service.walletPledgeProblem(c, service.getUser(DEMO_STREAMER_ID)!.wallet, 1_000_000)).toMatch(/streamer/);
    expect(service.walletPledgeProblem(c, FAN, 20_000_000)).toMatch(/limit/);
    expect(service.walletPledgeProblem(c, FAN, 2_000_000)).toBeUndefined();
  });
});

describe("milestone sound effects", () => {
  beforeEach(() => {
    resetForTests();
    delete process.env.QUICKNODE_WEBHOOK_SECRET;
  });

  it("plays one at half way and one at the goal", async () => {
    const c = await service.createChallenge(service.getUser(DEMO_STREAMER_ID)!, CHESS);
    const ana = await service.signIn("Ana", "fan");
    const ben = await service.signIn("Ben", "fan");
    const before = service.latestSeq();
    await service.pledge(ana, c.id, 4);
    await service.pledge(ana, c.id, 7);
    await service.pledge(ben, c.id, 9);
    const sfx = service.eventsSince("ryan", before).filter((e) => e.sfx).map((e) => [e.sfx, e.message]);
    expect(sfx).toEqual([
      ["half", expect.stringMatching(/vine is climbing/)],
      ["goal", expect.stringMatching(/reached the clouds/)],
    ]);
  });
});
