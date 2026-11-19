import { beforeEach, describe, expect, it } from "vitest";
import * as service from "../src/lib/service";
import { DEMO_STREAMER_ID, resetForTests } from "../src/lib/store";

const CHESS = { gameId: "chess", condition: { kind: "lichess", username: "ryan", speed: "bullet" }, goalUsd: 20, pledgeCapUsd: 15, minutes: 30 };
const settle = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  resetForTests();
  (globalThis as { __pottedAside?: Map<string, number> }).__pottedAside?.clear();
  delete process.env.XAI_API_KEY;
});

describe("the commentator's aside on the overlay", () => {
  it("reacts to the first pledge, after the pledge line, without being read aloud", async () => {
    const streamer = service.getUser(DEMO_STREAMER_ID)!;
    const c = await service.createChallenge(streamer, CHESS);
    const seq = service.latestSeq();
    await service.pledge(await service.signIn("Ana Ruiz", "fan"), c.id, 5);
    await settle();
    const events = service.eventsSince(streamer.handle!, seq);
    const pledged = events.find((e) => e.type === "pledged")!;
    const aside = events.find((e) => e.type === "comment")!;
    expect(aside.message).toBe("Ana plants the very first bean on this one.");
    expect(aside.seq).toBeGreaterThan(pledged.seq);
    expect(aside.about).toBe(pledged.seq);
  });

  it("keeps quiet for a while after an aside, and when the streamer turns it off", async () => {
    const streamer = service.getUser(DEMO_STREAMER_ID)!;
    const c = await service.createChallenge(streamer, CHESS);
    const seq = service.latestSeq();
    await service.pledge(await service.signIn("Ana", "fan"), c.id, 5);
    await service.pledge(await service.signIn("Bo", "fan"), c.id, 9);
    await settle();
    expect(service.eventsSince(streamer.handle!, seq).filter((e) => e.type === "comment")).toHaveLength(1);

    (globalThis as { __pottedAside?: Map<string, number> }).__pottedAside?.clear();
    await service.updateSettings(streamer, { ...service.settingsOf(streamer), overlayCommentary: false });
    const after = service.latestSeq();
    await service.pledge(await service.signIn("Cy", "fan"), c.id, 3);
    await settle();
    expect(service.eventsSince(streamer.handle!, after).filter((e) => e.type === "comment")).toHaveLength(0);
  });

  it("only gives the commentator facts from the records", async () => {
    const streamer = service.getUser(DEMO_STREAMER_ID)!;
    const c = await service.createChallenge(streamer, CHESS);
    const ana = await service.signIn("Ana", "fan");
    await service.pledge(ana, c.id, 4);
    await service.pledge(await service.signIn("Bo", "fan"), c.id, 2);
    const challenge = service.getChallenge(c.id);
    const pledges = service.fundersOf(c.id);
    expect(pledges.length).toBe(2);
    const facts = service.pledgeFacts(challenge, ana, { id: "p", challengeId: c.id, userId: ana.id, amountMicro: 7_000_000, refunded: false, createdAt: Date.now(), tx: "sim" }, []);
    expect(facts).toMatchObject({ planter: "Ana", amount: "$7", pot: "$6", goal: "$20", toGo: "$14", firstOnChallenge: true, planterPledgesTonight: 1 });
  });
});
