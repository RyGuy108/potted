import type { NewChallenge } from "./service";
import * as service from "./service";
import { ledger } from "./ledger";
import { planterId } from "./sample-data";
import { DEMO_GUEST_ID, DEMO_STREAMER_ID, db, save } from "./store";

/**
 * The live part of the demo sample: challenges open right now, opened and
 * funded through the normal service functions. On the Solana ledger every
 * step here is a real devnet transaction.
 */

const clip = (game: string, statement: string, disputeWindowSecs = 300): NewChallenge["condition"] => ({
  kind: "optimistic",
  game,
  statement,
  proof: "The clip shows the whole attempt, start to finish",
  disputeWindowSecs,
});

type Plan = { host: string; input: NewChallenge; pledges: [string, number][] };

const p = (name: string) => planterId(name);

export function livePlans(minutes: number): Plan[] {
  return [
    {
      host: DEMO_STREAMER_ID,
      input: { gameId: "gta6", condition: clip("GTA VI", "Finish the first heist without getting busted", 60), goalUsd: 50, pledgeCapUsd: 25, minutes, upfrontPct: 50 },
      pledges: [[p("iris_b"), 10], [p("Diego"), 5], [p("Maya"), 5], [p("marco"), 8]],
    },
    {
      host: "u_s_fern",
      input: { gameId: "fortnite", condition: { kind: "fortnite", accountName: "IronFernTTV", goal: "kills", count: 8 }, goalUsd: 40, pledgeCapUsd: 20, minutes },
      pledges: [[p("leoverse"), 10], [p("Ava K"), 3], [p("kofi"), 5], [p("Maya"), 5], [p("ruby"), 7]],
    },
    {
      host: "u_s_sol",
      input: { gameId: "cooking", condition: clip("Cooking", "Make fresh pasta from scratch in 30 minutes"), goalUsd: 60, pledgeCapUsd: 25, minutes },
      pledges: [[p("Lena"), 15], [p("hana"), 10], [p("elsie"), 5], [p("bea"), 10]],
    },
    {
      host: "u_s_nova",
      input: { gameId: "brawlstars", condition: { kind: "brawlstars", playerTag: "2QY0LPJC", wins: 3, battles: 5 }, goalUsd: 25, pledgeCapUsd: 10, minutes },
      pledges: [[p("raj"), 5], [p("cole"), 3]],
    },
    {
      host: "u_s_moss",
      input: { gameId: "chess", condition: { kind: "lichess", username: "mossbyte_chess", speed: "blitz", minOpponentRating: 1800 }, goalUsd: 20, pledgeCapUsd: 10, minutes },
      pledges: [[p("ezra"), 5], [p("junpark"), 4], [p("nia"), 6]],
    },
    {
      host: DEMO_GUEST_ID,
      input: { gameId: "fortnite", condition: { kind: "fortnite", accountName: "KaiOnTheKeys", goal: "wins", count: 1 }, goalUsd: 30, pledgeCapUsd: 15, minutes },
      pledges: [[p("felix_f"), 5], [p("Zara"), 5]],
    },
  ];
}

export interface LiveOptions {
  /** How long the live challenges stay open, in minutes (1 to 1440). */
  minutes: number;
  log?: (line: string) => void;
}

export async function addSampleLive({ minutes, log = () => {} }: LiveOptions): Promise<void> {
  const state = db();
  if (!state.sample) throw new Error("Add the sample history first");
  const opened = state.sample.challengeIds;
  const user = (id: string) => service.getUser(id) ?? (() => { throw new Error(`Missing sample account ${id}`); })();

  // Fund the planters who take part. On Solana this also gives each a wallet and token account.
  const plans = livePlans(minutes);
  const needs = new Map<string, number>();
  for (const plan of plans) for (const [fan, amount] of plan.pledges) needs.set(fan, (needs.get(fan) ?? 0) + amount);
  for (const fan of [p("noor"), p("benji"), p("chloe.mp4"), p("samwise"), p("tess"), p("omar.gg")]) needs.set(fan, (needs.get(fan) ?? 0) + 20);
  needs.set(p("Maya"), (needs.get(p("Maya")) ?? 0) + 30);
  needs.set("u_s_tester1", 50);
  needs.set("u_s_tester2", 50);
  const L = ledger();
  for (const [fan, usd] of needs) {
    await L.faucet(user(fan).wallet, Math.round(usd * 1_000_000));
    log(`funded ${user(fan).name} with $${usd}`);
  }
  save();

  for (const plan of plans) {
    const c = await service.createChallenge(user(plan.host), plan.input);
    opened.push(c.id);
    for (const [fan, amount] of plan.pledges) await service.pledge(user(fan), c.id, amount);
    log(`opened "${c.title}" for ${user(plan.host).name}, $${c.totalMicro / 1e6} pledged`);
  }

  // A collab, opened the proper way: Wren invites Juniper, Juniper accepts.
  const invite = await service.invite(user("u_s_wren"), "juniperplays", 40, {
    gameId: "speedrun",
    condition: clip("Celeste", "Get a sub-30 any% run, together"),
    goalUsd: 45,
    pledgeCapUsd: 20,
    minutes,
  });
  const collab = (await service.respondInvite(user("u_s_juniper"), invite.id, true))!;
  opened.push(collab.id);
  for (const [fan, amount] of [[p("tess"), 10], [p("omar.gg"), 8], [p("Maya"), 4]] as const) await service.pledge(user(fan), collab.id, amount);
  log(`opened the Wren and Juniper collab, $${collab.totalMicro / 1e6} pledged`);

  // An attempt in progress with a disputed clip, waiting for a keeper.
  const disputed = await service.createChallenge(user("u_s_juniper"), {
    gameId: "minecraft",
    condition: clip("Minecraft", "Beat the Ender Dragon in hardcore"),
    goalUsd: 40,
    pledgeCapUsd: 20,
    minutes,
    upfrontPct: 25,
  });
  opened.push(disputed.id);
  for (const [fan, amount] of [[p("noor"), 10], [p("benji"), 5], [p("chloe.mp4"), 8], [p("samwise"), 5]] as const) await service.pledge(user(fan), disputed.id, amount);
  await service.lock(user("u_s_juniper"), disputed.id);
  await service.claim(user("u_s_juniper"), disputed.id, "https://example.com/sample-clips/ender-dragon");
  await service.dispute(user(p("samwise")), disputed.id);
  log(`opened, started and disputed "${disputed.title}" (waiting for a keeper)`);

  // An invite for Ryan to answer on stage.
  await service.invite(user("u_s_juniper"), "ryan", 30, {
    gameId: "gta6",
    condition: clip("GTA VI", "Win a street race in Vice City without hitting a wall"),
    goalUsd: 40,
    pledgeCapUsd: 20,
    minutes,
  });
  log("Juniper invited Ryan to a collab");
  save();
}
