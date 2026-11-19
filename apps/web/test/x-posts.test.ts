import { beforeEach, describe, expect, it } from "vitest";
import * as service from "../src/lib/service";
import { DEMO_STREAMER_ID, resetForTests } from "../src/lib/store";
import { oauthHeader, postMoment, xPosts } from "../src/lib/x-posts";

beforeEach(() => {
  resetForTests();
  delete process.env.XAI_API_KEY;
  delete process.env.POTTED_X_POSTS;
});

describe("OAuth 1.0a signing for X", () => {
  it("matches the worked example in the Creating a signature page of X's docs", () => {
    const header = oauthHeader(
      "POST",
      "https://api.twitter.com/1.1/statuses/update.json",
      { consumerKey: "xvz1evFS4wEEPTGEFPHBog", consumerSecret: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw", token: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb", tokenSecret: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE" },
      { include_entities: "true", status: "Hello Ladies + Gentlemen, a signed OAuth request!" },
      "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg",
      "1318622958",
    );
    expect(header).toContain('oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"');
  });
});

describe("Grok posting from on-chain moments", () => {
  const CHESS = { gameId: "chess", condition: { kind: "lichess", username: "ryan", speed: "bullet" }, goalUsd: 20, pledgeCapUsd: 15, minutes: 30 };

  it("finds half way, the goal and the result in the program's events, and posts each once", async () => {
    const c = await service.createChallenge(service.getUser(DEMO_STREAMER_ID)!, CHESS);
    const account = service.chainAccountOf(c.ledgerRef!);
    const ev = (name: string, fields: Record<string, string | number | boolean>) => ({ name, challenge: account, signature: `sig-${name}-${JSON.stringify(fields)}`, fields: { challenge: account, ...fields } });
    const moments = service.momentsFrom(
      [ev("Pledged", { amount: 4_000_000, totalPledged: 4_000_000 }), ev("Pledged", { amount: 7_000_000, totalPledged: 11_000_000 }), ev("Pledged", { amount: 9_000_000, totalPledged: 20_000_000 }), ev("Settled", { success: true, paidOut: 20_000_000, evidenceRef: "x" })],
      "https://potted.example",
    );
    expect(moments.map((m) => [m.moment.kind, m.moment.pot])).toEqual([["half", "$11"], ["goal", "$20"], ["completed", "$20"]]);
    expect(moments[0]!.moment.link).toBe(`https://potted.example/c/${c.id}`);

    // Drafts without keys, from the fixed text.
    const draft = await postMoment(c.id, moments[1]!.moment);
    expect(draft).toMatchObject({ status: "draft", by: "rules", kind: "goal" });
    expect(draft!.text).toContain(`https://potted.example/c/${c.id}`);
    expect(await postMoment(c.id, moments[1]!.moment)).toBeUndefined();

    // Auto-posting with the account's keys: sent to X once, with an OAuth header.
    Object.assign(process.env, { POTTED_X_POSTS: "auto", X_API_KEY: "k", X_API_SECRET: "s", X_ACCESS_TOKEN: "t", X_ACCESS_SECRET: "ts" });
    const sent: { url: string; init: RequestInit }[] = [];
    const fakeX = (async (url: string, init: RequestInit) => {
      sent.push({ url, init });
      return Response.json({ data: { id: "1850000000000000000", text: "ok" } }, { status: 201 });
    }) as unknown as typeof fetch;
    const posted = await postMoment(c.id, moments[2]!.moment, fakeX);
    expect(posted).toMatchObject({ status: "posted", postId: "1850000000000000000", kind: "completed" });
    expect(sent[0]!.url).toBe("https://api.x.com/2/tweets");
    expect(String((sent[0]!.init.headers as Record<string, string>).Authorization)).toMatch(/^OAuth oauth_consumer_key="k"/);
    expect(JSON.parse(String(sent[0]!.init.body)).text).toContain("paid out on Solana");

    const refused = await postMoment(c.id, moments[0]!.moment, (async () => Response.json({ detail: "credits" }, { status: 402 })) as unknown as typeof fetch);
    expect(refused).toMatchObject({ status: "failed", error: expect.stringContaining("credits") });
    expect(xPosts().map((p) => p.kind)).toEqual(["half", "completed", "goal"]);
    for (const k of ["POTTED_X_POSTS", "X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_SECRET"]) delete process.env[k];
  });
});
