import { createHmac } from "node:crypto";
import { gzipSync } from "node:zlib";
import { discriminator } from "@potted/chain";
import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "../src/app/api/webhooks/quicknode/route";
import { chainEvents } from "../src/lib/chain";
import { resetForTests } from "../src/lib/store";

const PROGRAM = "2ppLCjxK534szs3T9o1vw3wW4gD9C6s2Dg5Coe2tqgNV";
const SECRET = "stream-token";
const amount = Buffer.alloc(8);
amount.writeBigUInt64LE(3_000_000n);
const locked = `Program data: ${Buffer.concat([discriminator("Locked"), Buffer.alloc(32, 7), amount]).toString("base64")}`;
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
    expect(await (await post(delivery)).json()).toEqual({ decoded: 1, stored: 1 });
    expect(await (await post(delivery, { gzip: true })).json()).toEqual({ decoded: 1, stored: 0 });
    expect(chainEvents()).toMatchObject([{ key: "sig1:0", name: "Locked", slot: 42, fields: { totalPledged: 3_000_000 } }]);
  });

  it("rejects a wrong signature and refuses to run unconfigured", async () => {
    expect((await post(delivery, { secret: "guess" })).status).toBe(401);
    expect(chainEvents()).toEqual([]);
    delete process.env.QUICKNODE_WEBHOOK_SECRET;
    expect((await post(delivery)).status).toBe(503);
  });
});
