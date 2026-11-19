import { beforeEach, describe, expect, it } from "vitest";
import { checkAwards, markRead, noticesFor, setFollow, unreadCount } from "../src/lib/notifications";
import { pointsConfig, redeem, resolveRedemption } from "../src/lib/points";
import * as service from "../src/lib/service";
import { DEMO_GUEST_ID, DEMO_STREAMER_ID, resetForTests } from "../src/lib/store";

const clip = { kind: "optimistic", game: "GTA VI", statement: "Finish the heist", disputeWindowSecs: 60 };
const titles = (id: string) => noticesFor(service.getUser(id)!, 50).map((n) => n.title);

beforeEach(() => {
  resetForTests();
  process.env.POTTED_ALLOW_SIMULATED_RESULTS = "true";
});

describe("notifications", () => {
  it("follows a challenge from opening to payout, for planters and the climber", async () => {
    const ryan = service.getUser(DEMO_STREAMER_ID)!;
    const maya = await service.signIn("Maya", "fan");
    const keeper = await service.signIn("Hazel", "mod");
    await setFollow(maya, "ryan", true);
    expect(titles(ryan.id)).toContain("Maya followed you");

    const c = await service.createChallenge(ryan, { gameId: "gta6", condition: clip, goalUsd: 10, pledgeCapUsd: 10, minutes: 30, upfrontPct: 50 });
    expect(titles(maya.id)).toContain("Ryan opened a challenge");

    await service.pledge(maya, c.id, 10);
    expect(titles(ryan.id)).toContain("Maya added $10");
    expect(titles(maya.id)).toContain("A pot you backed reached its goal");

    await service.lock(ryan, c.id);
    expect(titles(maya.id)).toContain("The attempt has started");
    expect(titles(ryan.id)).toContain("$5 paid up front");

    await service.claim(ryan, c.id, "https://clips.example.com/x");
    expect(titles(maya.id)).toContain("Clip posted: take a look");
    await service.dispute(maya, c.id);
    expect(titles(ryan.id)).toContain("Your clip was disputed");
    expect(titles(keeper.id)).toContain("A clip needs a keeper");

    await service.rule(keeper, c.id, true);
    expect(titles(maya.id)).toContain("Challenge completed!");
    expect(noticesFor(maya).find((n) => n.title === "Challenge completed!")!.body).toContain("your $10 helped");
    expect(titles(ryan.id)).toContain("You completed a challenge");
  });

  it("tells each planter what came back on a miss, and says cancelled when it was", async () => {
    const ryan = service.getUser(DEMO_STREAMER_ID)!;
    const maya = await service.signIn("Maya", "fan");
    const c = await service.createChallenge(ryan, { gameId: "gta6", condition: clip, goalUsd: 10, pledgeCapUsd: 10, minutes: 30 });
    await service.pledge(maya, c.id, 4);
    await service.cancel(ryan, c.id);
    const n = noticesFor(maya).find((x) => x.kind === "refund")!;
    expect(n.title).toBe("Challenge cancelled: you've been refunded");
    // The refund also earns a badge, announced on its own.
    expect(titles(maya.id)).toContain("Badge earned: Money back");
    expect(n.body).toContain("$4 of $4 came back");
    expect(titles(ryan.id)).not.toContain("A challenge was missed");
  });

  it("announces new badges and levels, but not ones earned before", async () => {
    const ryan = service.getUser(DEMO_STREAMER_ID)!;
    const maya = await service.signIn("Maya", "fan");
    const c = await service.createChallenge(ryan, { gameId: "gta6", condition: clip, goalUsd: 10, pledgeCapUsd: 10, minutes: 30 });
    await service.pledge(maya, c.id, 2);
    // The first pledge sets the baseline quietly.
    expect(titles(maya.id).filter((t) => t.startsWith("Badge earned"))).toHaveLength(0);
    // Taking the pot to its goal earns Cloud pusher.
    await service.pledge(maya, c.id, 8);
    expect(titles(maya.id)).toContain("Badge earned: Cloud pusher");
    expect(titles(maya.id).filter((t) => t === "Badge earned: First bean")).toHaveLength(0);
    await service.lock(ryan, c.id);
    await service.simulateResult(ryan, c.id, true);
    // The climber's first completion is a milestone; the first check was the baseline.
    checkAwards(ryan);
    const c2 = await service.createChallenge(ryan, { gameId: "gta6", condition: clip, goalUsd: 10, pledgeCapUsd: 10, minutes: 30 });
    await service.pledge(maya, c2.id, 2);
    await service.lock(ryan, c2.id);
    await service.simulateResult(ryan, c2.id, true);
    expect(titles(ryan.id).filter((t) => t.startsWith("Milestone: "))).toEqual([]);
  });

  it("covers ideas, invites and redemptions, and tracks what is read", async () => {
    const ryan = service.getUser(DEMO_STREAMER_ID)!;
    const kai = service.getUser(DEMO_GUEST_ID)!;
    const maya = await service.signIn("Maya", "fan");
    await service.suggest(maya, "ryan", "gta6", "Win a race without crashing");
    expect(titles(ryan.id)).toContain("Maya suggested a challenge");
    const inv = await service.invite(ryan, "kai", 40, { gameId: "gta6", condition: clip, goalUsd: 10, pledgeCapUsd: 10, minutes: 30 });
    expect(titles(kai.id)).toContain("Ryan invited you to a collab");
    await service.respondInvite(kai, inv.id, true);
    expect(titles(ryan.id)).toContain("Kai accepted your collab");

    const c = await service.createChallenge(ryan, { gameId: "gta6", condition: clip, goalUsd: 20, pledgeCapUsd: 20, minutes: 30 });
    await service.pledge(maya, c.id, 5);
    const reward = pointsConfig(ryan.id).rewards[0]!;
    const r = await redeem(maya, "ryan", reward.id);
    expect(titles(ryan.id)).toContain(`Maya redeemed ${reward.title}`);
    await resolveRedemption(ryan, r.id, "fulfilled");
    expect(titles(maya.id)).toContain(`Ryan fulfilled ${reward.title}`);

    expect(unreadCount(maya)).toBeGreaterThan(0);
    markRead(maya);
    expect(unreadCount(maya)).toBe(0);
    await setFollow(maya, "ryan", true);
    await expect(setFollow(ryan, "kai", true)).rejects.toThrow("planter");
  });
});
