import { beforeEach, describe, expect, it } from "vitest";
import { GET as manifest } from "../src/app/actions.json/route";
import { GET as card, POST as pledge } from "../src/app/api/actions/pledge/[id]/route";
import { GET as icon } from "../src/app/api/actions/pledge/[id]/icon/route";
import * as service from "../src/lib/service";
import { DEMO_STREAMER_ID, resetForTests } from "../src/lib/store";

const CHESS = { gameId: "chess", condition: { kind: "lichess", username: "ryan", speed: "bullet" }, goalUsd: 20, pledgeCapUsd: 15, minutes: 30 };
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => resetForTests());

describe("Solana Actions (Blinks)", () => {
  it("maps challenge pages to the pledge Action, with the headers wallets need", async () => {
    const res = manifest();
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await res.json()).toEqual({ rules: expect.arrayContaining([{ pathPattern: "/c/*", apiPath: "/api/actions/pledge/*" }]) });
  });

  it("describes the challenge with pledge buttons, and turns them off on a simulated ledger", async () => {
    const c = await service.createChallenge(service.getUser(DEMO_STREAMER_ID)!, CHESS);
    const res = await card(new Request(`http://localhost:3000/api/actions/pledge/${c.id}`), ctx(c.id));
    expect(res.headers.get("X-Action-Version")).toBe("2.4");
    expect(res.headers.get("X-Blockchain-Ids")).toMatch(/^solana:/);
    const body = await res.json();
    expect(body).toMatchObject({ type: "action", title: c.title, icon: `http://localhost:3000/api/actions/pledge/${c.id}/icon`, disabled: true });
    expect(body.links.actions.map((a: { label: string }) => a.label)).toEqual(["Pledge $1", "Pledge $5", "Pledge $10", "Pledge"]);
    expect(body.links.actions[3].href).toContain("amount={amount}");
    const refused = await pledge(new Request(`http://localhost:3000/api/actions/pledge/${c.id}?amount=5`, { method: "POST", body: JSON.stringify({ account: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" }) }), ctx(c.id));
    expect(refused.status).toBe(400);
    expect((await refused.json()).message).toMatch(/simulated/);
  });

  it("draws a square icon with the escaped title and pot", async () => {
    const c = await service.createChallenge(service.getUser(DEMO_STREAMER_ID)!, CHESS);
    const svg = await (await icon(new Request("http://x"), ctx(c.id))).text();
    expect(svg).toContain('width="600" height="600"');
    expect(svg).toContain("$0");
    expect((await icon(new Request("http://x"), ctx("nope"))).status).toBe(404);
  });

  it("says half way when the pot crosses half its goal without reaching a new stage", async () => {
    const c = await service.createChallenge(service.getUser(DEMO_STREAMER_ID)!, CHESS);
    const ana = await service.signIn("Ana", "fan");
    await service.pledge(ana, c.id, 7);
    const before = service.latestSeq();
    await service.pledge(ana, c.id, 4);
    expect(service.eventsSince("ryan", before).find((e) => e.sfx)).toMatchObject({ sfx: "half", message: "Half way there! $11 of $20." });
  });
});
