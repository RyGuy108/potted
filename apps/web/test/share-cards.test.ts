import React from "react";
(globalThis as { React?: typeof React }).React = React;
import { beforeEach, describe, expect, it } from "vitest";
import * as service from "../src/lib/service";
import { pledgeCard, pledgeCardFacts, streamerCard } from "../src/lib/share-cards";
import { DEMO_STREAMER_ID, resetForTests } from "../src/lib/store";

const CHESS = { gameId: "chess", condition: { kind: "lichess", username: "ryan", speed: "bullet" }, goalUsd: 20, pledgeCapUsd: 15, minutes: 30 };
const png = async (r: Response) => new Uint8Array(await r.arrayBuffer()).slice(0, 4);

beforeEach(() => resetForTests());

describe("share cards", () => {
  it("draws a pledge's card, and a climber's card, as PNGs", async () => {
    const streamer = service.getUser(DEMO_STREAMER_ID)!;
    const c = await service.createChallenge(streamer, CHESS);
    const p = await service.pledge(await service.signIn("Ana Ruiz", "fan"), c.id, 5);
    expect(pledgeCardFacts(p.id)).toMatchObject({ planter: { name: "Ana Ruiz" }, challenge: { id: c.id } });
    for (const card of [pledgeCard(p.id)!, streamerCard(streamer.handle!)!]) {
      expect(card.headers.get("content-type")).toBe("image/png");
      expect([...(await png(card))]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    }
    expect(pledgeCard("p_nope")).toBeUndefined();
    expect(streamerCard("nobody-here")).toBeUndefined();
  }, 30_000);
});
