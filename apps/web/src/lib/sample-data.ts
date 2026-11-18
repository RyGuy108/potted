import {
  type Challenge,
  type Condition,
  type Evidence,
  type Pledge,
  type Split,
  type Verdict,
  describeCondition,
  keptOnRefund,
  splitPot,
  upfrontOf,
} from "@potted/core";
import { type Db, type Invite, type Role, type StreamEvent, type StreamSettings, type Suggestion, type User, DEMO_GUEST_ID, DEMO_STREAMER_ID } from "./store";

/**
 * Sample history for demos: climbers, planters and keepers with about six
 * weeks of finished challenges behind them. Everything here is written
 * straight into the store on the simulated ledger and every settlement is
 * marked `sample`, so a page never presents it as checked game data or as
 * on-chain money. Live challenges are added separately, through the normal
 * service functions, so they run on whichever ledger is configured.
 */

const DAY = 24 * 60 * 60_000;
const MIN = 60_000;
const usd = (n: number) => Math.round(n * 1_000_000);

/** Every sample record's id carries this, so the sample can be removed again. */
export const SAMPLE_TAG = "_s_";
export const isSampleId = (id: string | undefined) => !!id && id.includes(SAMPLE_TAG);

/** Accounts the sign-in panel offers as one-click demo logins. */
export const SAMPLE_SIGN_INS: { id: string; label: string; role: Role; note: string }[] = [
  { id: "u_s_juniper", label: "Juniper", role: "streamer", note: "Climber with a disputed clip live" },
  { id: "u_s_maya", label: "Maya", role: "fan", note: "Planter with six weeks of history" },
  { id: "u_s_tester1", label: "Tester One", role: "fan", note: "Fresh planter, $50 test USDC" },
  { id: "u_s_tester2", label: "Tester Two", role: "fan", note: "Fresh planter, $50 test USDC" },
  { id: "u_s_hazel", label: "Hazel", role: "mod", note: "Keeper with past rulings" },
  { id: "u_s_keeper", label: "Keeper Test", role: "mod", note: "Fresh keeper" },
];

interface StreamerSpec {
  id: string;
  name: string;
  handle: string;
  games: string[];
  /** How many past streams to generate. */
  sessions: number;
  fortnite?: string;
  lichess?: string;
  brawl?: string;
  steamId?: string;
  cause?: { name: string; pct: number };
  settings?: Partial<StreamSettings>;
}

export const SAMPLE_STREAMERS: StreamerSpec[] = [
  { id: "u_s_juniper", name: "Juniper", handle: "juniperplays", games: ["minecraft", "speedrun", "other"], sessions: 7, settings: { voice: "sarah" } },
  { id: "u_s_moss", name: "Moss", handle: "mossbyte", games: ["chess", "study"], sessions: 6, lichess: "mossbyte_chess" },
  { id: "u_s_fern", name: "Fern", handle: "ironfern", games: ["fortnite", "steam"], sessions: 7, fortnite: "IronFernTTV", steamId: "76561198000004417" },
  { id: "u_s_sol", name: "Sol", handle: "solcooks", games: ["cooking", "fitness"], sessions: 5, cause: { name: "Hearthside Food Pantry", pct: 50 } },
  { id: "u_s_wren", name: "Wren", handle: "wrenruns", games: ["speedrun", "fitness", "steam"], sessions: 6, steamId: "76561198000007731" },
  { id: "u_s_nova", name: "Nova", handle: "novabrawl", games: ["brawlstars", "other"], sessions: 5, brawl: "2QY0LPJC" },
  { id: "u_s_ash", name: "Ash", handle: "ashsketches", games: ["art", "music"], sessions: 4 },
];

/** The two built-in demo climbers get a past too. */
const HOSTS: StreamerSpec[] = [
  { id: DEMO_STREAMER_ID, name: "Ryan", handle: "ryan", games: ["gta6", "steam", "gta6"], sessions: 7, steamId: "76561198000001108" },
  { id: DEMO_GUEST_ID, name: "Kai", handle: "kai", games: ["fortnite", "gta6"], sessions: 5, fortnite: "KaiOnTheKeys" },
];

const PLANTERS = [
  "Maya", "leoverse", "Ava K", "samwise", "iris_b", "Diego", "noor", "benji", "chloe.mp4", "ezra",
  "Lena", "omar.gg", "tess", "junpark", "ruby", "felix_f", "Zara", "kofi", "elsie", "marco",
  "ines", "hana", "raj", "bea", "cole", "nia",
];
export const planterId = (name: string) => `u_s_${name.toLowerCase().replace(/[^a-z0-9]/g, "")}`;

const KEEPERS = [
  { id: "u_s_hazel", name: "Hazel" },
  { id: "u_s_otto", name: "Otto" },
  { id: "u_s_mira", name: "Mira" },
];

const CLIP_IDEAS: Record<string, { game: string; statements: string[] }> = {
  gta6: { game: "GTA VI", statements: ["Finish the first heist without getting busted", "Lose a 5-star wanted level in under 3 minutes", "Win a street race in Vice City without hitting a wall", "Pull off the bank job with nobody in the crew going down"] },
  minecraft: { game: "Minecraft", statements: ["Beat the Ender Dragon in hardcore", "Find diamonds in under 20 minutes on a fresh seed", "Survive the first night with no tools", "Build a working iron farm before the stream ends"] },
  speedrun: { game: "Celeste", statements: ["Beat my any% personal best tonight", "Get a sub-30 any% run", "Finish Chapter 7 deathless"] },
  fitness: { game: "Fitness", statements: ["Finish a 5k on the treadmill without stopping", "100 push-ups before the stream ends", "Hold a 3-minute plank"] },
  cooking: { game: "Cooking", statements: ["Plate a three-course dinner in 45 minutes", "Make fresh pasta from scratch in 30 minutes", "Bake a loaf that passes the thump test"] },
  music: { game: "Music", statements: ["Learn and play a song chat picks by the end of stream", "Play the full solo from memory", "Write and perform a one-minute song from chat's three words"] },
  art: { game: "Art", statements: ["Finish the commission live in one sitting", "Draw chat's character in 20 minutes", "Paint a landscape with only three colours"] },
  study: { game: "Coding", statements: ["Ship the login page before the stream ends", "Solve 3 LeetCode hards in 90 minutes", "Get the test suite green tonight"] },
  other: { game: "Elden Ring", statements: ["Beat Malenia without summons", "Clear Stormveil without dying", "Beat the Tree Sentinel at level 1"] },
};

const STEAM_GOALS = [
  { appId: 1145360, gameName: "Hades", achievement: "ESCAPED_TARTARUS", achievementTitle: "Escaped Tartarus" },
  { appId: 367520, gameName: "Hollow Knight", achievement: "FALSE_KNIGHT", achievementTitle: "Falsehood" },
  { appId: 504230, gameName: "Celeste", achievement: "CHAPTER_7", achievementTitle: "Reach the summit" },
  { appId: 1245620, gameName: "Elden Ring", achievement: "MARGIT", achievementTitle: "Margit, the Fell Omen" },
];

const IDEAS = [
  "Do the next run with the controller upside down",
  "No healing items for the whole boss fight",
  "Only use the starter weapon",
  "Let chat pick the route",
  "Blindfolded for the first minute",
  "Win one with chat's pick",
];

/** A small seeded random generator, so the sample is the same every run. */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)]!,
    chance: (p: number) => next() < p,
  };
}

/** Minutes from midnight UTC that land in a US evening. */
const EVENING_SLOTS = [0, 30, 60, 90, 120, 150, 180, 1380, 1410];

export interface SampleHistory {
  users: User[];
  challenges: Challenge[];
  pledges: Pledge[];
  suggestions: Suggestion[];
  invites: Invite[];
  events: Omit<StreamEvent, "seq">[];
  /** Simulated-ledger balances for the sample accounts. */
  balances: Record<string, number>;
}

/** Builds the sample history up to `now`. The two demo climbers must already exist in `users`. */
export function buildSampleHistory(now: number, existing: User[]): SampleHistory {
  const r = rng(20261120);
  let serial = 0;
  const id = (prefix: string) => `${prefix}${SAMPLE_TAG}${(++serial).toString(36).padStart(4, "0")}`;
  const simTx = () => `sim-tx${SAMPLE_TAG}${(++serial).toString(36).padStart(5, "0")}`;

  const users: User[] = [];
  const joined = (daysAgo: number) => now - daysAgo * DAY - r.int(0, 600) * MIN;
  for (const s of SAMPLE_STREAMERS) {
    users.push({
      id: s.id,
      name: s.name,
      role: "streamer",
      handle: s.handle,
      wallet: `sim:${s.id}`,
      createdAt: joined(r.int(48, 70)),
      settings: {
        ...s.settings,
        ...(s.cause ? { causeOn: true, causeName: s.cause.name, causePct: s.cause.pct } : {}),
      },
    });
  }
  for (const name of PLANTERS) {
    users.push({ id: planterId(name), name, role: "fan", wallet: `sim:${planterId(name)}`, createdAt: joined(name === "Maya" ? 52 : r.int(10, 50)) });
  }
  for (const k of KEEPERS) users.push({ id: k.id, name: k.name, role: "mod", wallet: `sim:${k.id}`, createdAt: joined(r.int(45, 60)) });
  users.push({ id: "u_s_tester1", name: "Tester One", role: "fan", wallet: "sim:u_s_tester1", createdAt: now - 2 * DAY });
  users.push({ id: "u_s_tester2", name: "Tester Two", role: "fan", wallet: "sim:u_s_tester2", createdAt: now - 2 * DAY });
  users.push({ id: "u_s_keeper", name: "Keeper Test", role: "mod", wallet: "sim:u_s_keeper", createdAt: now - 2 * DAY });

  const everyone = [...existing, ...users];
  const nameOf = (uid: string) => everyone.find((u) => u.id === uid)?.name ?? "A climber";
  const specs = [...HOSTS, ...SAMPLE_STREAMERS];
  const fans = PLANTERS.map(planterId);
  // Each climber has regulars who show up most streams.
  const regulars = new Map(specs.map((s) => [s.id, Array.from({ length: 6 }, () => r.pick(fans.filter((f) => f !== "u_s_maya")))]));

  const challenges: Challenge[] = [];
  const pledges: Pledge[] = [];
  const invites: Invite[] = [];
  const events: Omit<StreamEvent, "seq">[] = [];

  function condition(spec: StreamerSpec, gameId: string): Condition {
    switch (gameId) {
      case "chess":
        return { kind: "lichess", username: spec.lichess ?? "potted_sample", goal: "win_next_rated", speed: r.pick(["blitz", "rapid"] as const), minPlies: 20, ...(r.chance(0.5) ? { minOpponentRating: r.pick([1600, 1800, 2000]) } : {}) };
      case "fortnite":
        return r.chance(0.5)
          ? { kind: "fortnite", accountName: spec.fortnite ?? "PottedSample", goal: "kills", count: r.pick([5, 8, 10, 12]) }
          : { kind: "fortnite", accountName: spec.fortnite ?? "PottedSample", goal: "wins", count: r.pick([1, 1, 2]) };
      case "brawlstars": {
        const battles = r.pick([3, 5, 5, 7]);
        return { kind: "brawlstars", playerTag: spec.brawl ?? "2QY0LPJC", goal: "wins_in_next_battles", wins: Math.min(battles, r.int(2, 4)), battles };
      }
      case "steam":
        return { kind: "steam", steamId: spec.steamId ?? "76561198000000001", ...r.pick(STEAM_GOALS) };
      default: {
        const idea = CLIP_IDEAS[gameId] ?? CLIP_IDEAS.other!;
        return { kind: "optimistic", game: idea.game, statement: r.pick(idea.statements), disputeWindowSecs: 300, proof: "The clip shows the whole attempt, start to finish" };
      }
    }
  }

  /** Reasons and evidence in the words the real adapters use, marked as sample. */
  function result(c: Condition, success: boolean, claimed: boolean, ruling?: "upheld" | "rejected"): Verdict {
    const sample = (source: string, summary: string): Evidence => ({ source, ref: "sample", summary, sample: true });
    switch (c.kind) {
      case "optimistic": {
        const evidence = claimed ? sample("clip", `Streamer's clip for "${c.statement}".`) : undefined;
        if (ruling === "upheld") return { outcome: "success", reason: "A moderator reviewed the dispute and upheld the claim", evidence };
        if (ruling === "rejected") return { outcome: "failure", reason: "A moderator reviewed the dispute and rejected the claim", evidence };
        return success ? { outcome: "success", reason: "No funder disputed the clip in time", evidence } : { outcome: "failure", reason: "No claim was made before the deadline" };
      }
      case "steam":
        return success
          ? { outcome: "success", reason: `Unlocked "${c.achievementTitle}"`, evidence: sample("steam", `Steam recorded "${c.achievementTitle}" in ${c.gameName} as unlocked during the attempt.`) }
          : { outcome: "failure", reason: `Deadline passed without unlocking "${c.achievementTitle}"` };
      case "lichess": {
        const opp = `${r.pick(["knightowl", "pawnstorm88", "e4enjoyer", "rookie_rook", "castlequeen"])} (${r.int(1550, 2150)})`;
        return {
          outcome: success ? "success" : "failure",
          reason: `${c.username} ${success ? "won" : r.pick(["lost", "drew"])} against ${opp}`,
          evidence: sample("lichess", `First rated ${c.speed ?? ""} game after the attempt began.`.replace("  ", " ")),
        };
      }
      case "fortnite": {
        const what = c.goal === "wins" ? "Victory Royales" : "eliminations";
        const got = success ? c.count + r.int(0, 2) : r.int(0, Math.max(0, c.count - 1));
        return {
          outcome: success ? "success" : "failure",
          reason: success ? `${c.accountName} reached ${got} ${what}` : `Deadline passed with ${got} of ${c.count} ${what}`,
          evidence: sample("fortnite", `Change in ${c.accountName}'s public totals during the attempt: ${got} ${what}.`),
        };
      }
      case "brawlstars": {
        const won = success ? c.wins : r.int(0, c.wins - 1);
        return {
          outcome: success ? "success" : "failure",
          reason: `Won ${won} of the next ${c.battles} battles`,
          evidence: sample("brawlstars", `Battle log after the attempt began: ${won} wins in ${c.battles} battles.`),
        };
      }
    }
  }

  /** Keeper rulings so far, so the work is spread with Hazel doing most. */
  const keeperPick = () => (r.chance(0.55) ? KEEPERS[0]! : r.pick(KEEPERS.slice(1)));

  function addChallenge(spec: StreamerSpec, start: number, opts: { guest?: StreamerSpec; gameId?: string; extraFans?: string[] } = {}) {
    const gameId = opts.gameId ?? r.pick(spec.games);
    const cond = condition(spec, gameId);
    const minutes = r.pick([30, 45, 60, 60, 90]);
    const created = start;
    const deadline = created + minutes * MIN;
    const disputeMs = cond.kind === "optimistic" ? cond.disputeWindowSecs * 1000 : 0;
    const goalUsd = r.pick([10, 15, 20, 25, 30, 40, 50, 75, 100]);
    const capUsd = Math.max(5, Math.min(50, r.pick([5, 10, 15, 20, 25, 50])));
    const upfrontPct = r.chance(0.3) ? r.pick([10, 25, 50]) : 0;
    const splits: Split[] = [];
    if (opts.guest) splits.push({ kind: "guest", userId: opts.guest.id, name: opts.guest.name, pct: r.pick([30, 40, 50]) });
    if (spec.cause) splits.push({ kind: "cause", name: spec.cause.name, pct: spec.cause.pct });

    const c: Challenge = {
      id: id("c"),
      streamerId: spec.id,
      title: describeCondition(cond),
      gameId,
      condition: cond,
      status: "open",
      goalMicro: usd(goalUsd),
      pledgeCapMicro: usd(capUsd),
      totalMicro: 0,
      createdAt: created,
      deadline,
      settleBy: deadline + disputeMs + 10 * MIN,
      ...(upfrontPct ? { upfrontPct } : {}),
      ...(splits.length ? { splits } : {}),
      txs: { create: simTx() },
    };
    c.ledgerRef = `sim:${c.id}`;

    // Pledges in the first part of the window, until the pot lands somewhere around its goal.
    const target = usd(goalUsd * (0.35 + r.next() * 1.15));
    const pool = [...new Set([...(opts.extraFans ?? []), ...regulars.get(spec.id)!, ...(opts.guest ? regulars.get(opts.guest.id)! : []), ...Array.from({ length: 6 }, () => r.pick(fans))])];
    if (r.chance(0.17)) pool.splice(r.int(0, 2), 0, "u_s_maya");
    const lockAt = created + Math.round(minutes * (0.35 + r.next() * 0.25)) * MIN;
    let t = created + r.int(1, 4) * MIN;
    for (const fan of pool) {
      if (c.totalMicro >= target || t >= lockAt) break;
      if (r.chance(0.25) && fan !== "u_s_maya") continue;
      const amount = Math.min(c.pledgeCapMicro, usd(r.pick([1, 2, 3, 5, 5, 5, 10, 10, 15, 20, 25])));
      pledges.push({ id: id("p"), challengeId: c.id, userId: fan, amountMicro: amount, refunded: false, createdAt: t, tx: simTx() });
      c.totalMicro += amount;
      t += r.int(1, 6) * MIN;
    }
    challenges.push(c);
    events.push({ at: created, type: "created", handle: spec.handle, challengeId: c.id, message: opts.guest ? `New collab with ${spec.name} and ${opts.guest.name}: ${c.title}.` : `New challenge: ${c.title}.` });
    if (opts.guest) {
      invites.push({
        id: id("i"),
        hostId: spec.id,
        guestId: opts.guest.id,
        guestPct: splits[0]!.pct,
        input: { gameId, condition: cond, goalUsd, pledgeCapUsd: capUsd, minutes, ...(upfrontPct ? { upfrontPct } : {}) },
        title: c.title,
        createdAt: created - r.int(20, 300) * MIN,
        status: "accepted",
        challengeId: c.id,
      });
    }

    // How it ended.
    const roll = r.next();
    const mine = pledges.filter((p) => p.challengeId === c.id);
    if (mine.length === 0 || roll < 0.06) {
      // Called off before the attempt.
      settle(c, "cancel", Math.max(t, created + 5 * MIN));
      return c;
    }
    c.status = "locked";
    c.lockedAt = lockAt;
    c.txs.lock = simTx();
    if (upfrontPct) c.upfrontPaidMicro = upfrontOf(c.totalMicro, upfrontPct);
    if (roll < 0.1) {
      settle(c, "expire", c.settleBy + r.int(1, 30) * MIN);
      return c;
    }
    const success = roll < 0.74;
    if (cond.kind === "optimistic") {
      if (success || r.chance(0.35)) {
        // A clip was posted; a few get disputed and go to a keeper.
        const claimedAt = lockAt + Math.round((deadline - lockAt) * (0.4 + r.next() * 0.5));
        c.claim = { clipUrl: `https://example.com/sample-clips/${c.id}`, claimedAt, disputedBy: [] };
        const disputed = r.chance(success ? 0.35 : 1);
        if (disputed) {
          c.claim.disputedBy = [r.pick(mine).userId];
          const keeper = keeperPick();
          c.claim.ruling = success ? "upheld" : "rejected";
          c.claim.ruledBy = keeper.id;
          c.claim.ruledAt = claimedAt + r.int(6, 40) * MIN;
          c.verdict = result(cond, success, true, c.claim.ruling);
          settle(c, success ? "paid" : "failed", c.claim.ruledAt);
        } else {
          c.verdict = result(cond, true, true);
          settle(c, "paid", claimedAt + cond.disputeWindowSecs * 1000);
        }
        return c;
      }
      c.verdict = result(cond, false, false);
      settle(c, "failed", deadline + MIN);
      return c;
    }
    c.verdict = result(cond, success, false);
    settle(c, success ? "paid" : "failed", success ? lockAt + Math.round((deadline - lockAt) * (0.3 + r.next() * 0.6)) : deadline + MIN);
    return c;
  }

  function settle(c: Challenge, how: "paid" | "failed" | "cancel" | "expire", at: number) {
    c.settledAt = at;
    c.txs.settle = simTx();
    const spec = specs.find((s) => s.id === c.streamerId)!;
    if (how === "paid") {
      c.status = "paid";
      const { parts } = splitPot(c.totalMicro, c.splits);
      const gifts = (c.splits ?? []).flatMap((s, i) => (s.kind === "cause" ? [` $${(parts[i]! / 1e6).toFixed(2)} goes to ${s.name}.`] : []));
      events.push({ at, type: "paid", handle: spec.handle, challengeId: c.id, message: `Challenge complete! The pot was $${(c.totalMicro / 1e6).toFixed(2)}.${gifts.join("")}` });
      return;
    }
    c.status = "failed";
    if (how === "cancel") c.verdict = { outcome: "failure", reason: "Cancelled by the streamer" };
    if (how === "expire") c.verdict = { outcome: "failure", reason: "No result arrived in time, so every pledge was refunded" };
    // Refund each fan, keeping the up-front share exactly as refundAll does.
    const byFan = new Map<string, Pledge[]>();
    for (const p of pledges) if (p.challengeId === c.id) byFan.set(p.userId, [...(byFan.get(p.userId) ?? []), p]);
    for (const list of byFan.values()) {
      const pledged = list.reduce((sum, p) => sum + p.amountMicro, 0);
      let kept = c.upfrontPaidMicro ? keptOnRefund(pledged, c.upfrontPct ?? 0) : 0;
      const tx = simTx();
      for (const p of list) {
        const keptHere = Math.min(kept, p.amountMicro);
        kept -= keptHere;
        p.refunded = true;
        p.refundMicro = p.amountMicro - keptHere;
        p.refundTx = tx;
      }
    }
    events.push({ at, type: how === "failed" ? "failed" : "refunded", handle: spec.handle, challengeId: c.id, message: how === "cancel" ? "Challenge cancelled." : "Challenge missed. Pledges went back to fans." });
  }

  // Past streams: one to three challenges each, spread over the last six weeks.
  const partner = (spec: StreamerSpec) =>
    spec.id === DEMO_STREAMER_ID ? HOSTS[1] : spec.id === DEMO_GUEST_ID ? HOSTS[0] : spec.id === "u_s_juniper" ? SAMPLE_STREAMERS[4] : spec.id === "u_s_wren" ? SAMPLE_STREAMERS[0] : undefined;
  for (const spec of specs) {
    const days = new Set<number>();
    while (days.size < spec.sessions) days.add(r.int(1, 42));
    for (const daysAgo of days) {
      const start = now - daysAgo * DAY - (now % DAY) + r.pick(EVENING_SLOTS) * MIN;
      const count = r.int(1, 3);
      for (let i = 0; i < count; i++) {
        const guest = r.chance(0.18) ? partner(spec) : undefined;
        addChallenge(spec, start + i * r.int(25, 50) * MIN, guest ? { guest } : {});
      }
    }
  }

  // Maya pledges every day of the last week, so her streak is real.
  for (let daysAgo = 1; daysAgo <= 8; daysAgo++) {
    const dayStart = now - daysAgo * DAY - (now % DAY);
    const onDay = challenges.filter((c) => c.createdAt >= dayStart && c.createdAt < dayStart + DAY);
    if (onDay.some((c) => pledges.some((p) => p.challengeId === c.id && p.userId === "u_s_maya"))) continue;
    addChallenge(r.pick(specs), dayStart + r.pick(EVENING_SLOTS) * MIN, { extraFans: ["u_s_maya"] });
  }

  challenges.sort((a, b) => a.createdAt - b.createdAt);
  pledges.sort((a, b) => a.createdAt - b.createdAt);
  events.sort((a, b) => a.at - b.at);

  // Ideas from planters: some used, some dismissed, a few still waiting.
  const suggestions: Suggestion[] = [];
  for (const spec of specs) {
    const n = r.int(3, 5);
    for (let i = 0; i < n; i++) {
      const fan = i === 0 && r.chance(0.5) ? "u_s_maya" : r.pick(fans);
      const waiting = i >= n - r.int(1, 2);
      const gameId = r.pick(spec.games.filter((g) => !["chess", "fortnite", "brawlstars", "steam"].includes(g))) ?? "other";
      suggestions.push({
        id: id("sg"),
        streamerId: spec.id,
        userId: fan,
        fanName: nameOf(fan),
        gameId: gameId || "other",
        text: r.pick(CLIP_IDEAS[gameId]?.statements ?? IDEAS),
        createdAt: waiting ? now - r.int(30, 36 * 60) * MIN : now - r.int(3, 40) * DAY,
        status: waiting ? "pending" : r.chance(0.65) ? "used" : "dismissed",
      });
    }
  }

  // Simulated-ledger balances: climbers hold what they earned, planters some change.
  const balances: Record<string, number> = {};
  for (const u of users) {
    if (u.role === "fan" && !u.id.startsWith("u_s_tester")) balances[u.wallet] = usd(r.int(6, 60));
    if (u.role === "streamer") {
      let earned = 0;
      for (const c of challenges) {
        const upfront = c.upfrontPaidMicro ?? 0;
        const share = (amount: number) => {
          const { hostMicro, parts } = splitPot(amount, c.splits);
          if (c.streamerId === u.id) return hostMicro;
          const i = (c.splits ?? []).findIndex((s) => s.userId === u.id);
          return i >= 0 ? parts[i]! : 0;
        };
        earned += share(upfront) + (c.status === "paid" ? share(c.totalMicro - upfront) : 0);
      }
      balances[u.wallet] = earned;
    }
  }

  return { users, challenges, pledges, suggestions, invites, events, balances };
}

/** Takes every sample record back out, leaving everything else as it was. */
export function removeSample(state: Db): number {
  const before = state.users.length + state.challenges.length + state.pledges.length;
  const sampleUsers = new Set(state.users.filter((u) => isSampleId(u.id)).map((u) => u.id));
  const sampleChallenges = new Set(
    state.challenges
      .filter((c) => isSampleId(c.id) || sampleUsers.has(c.streamerId) || (state.sample?.challengeIds ?? []).includes(c.id))
      .map((c) => c.id),
  );
  state.users = state.users.filter((u) => !sampleUsers.has(u.id));
  state.challenges = state.challenges.filter((c) => !sampleChallenges.has(c.id));
  state.pledges = state.pledges.filter((p) => !sampleChallenges.has(p.challengeId) && !sampleUsers.has(p.userId));
  state.suggestions = state.suggestions.filter((s) => !isSampleId(s.id) && !sampleUsers.has(s.streamerId) && !sampleUsers.has(s.userId));
  state.invites = state.invites.filter((i) => !isSampleId(i.id) && !sampleUsers.has(i.hostId) && !sampleUsers.has(i.guestId));
  state.events = state.events.filter((e) => !sampleChallenges.has(e.challengeId));
  for (const key of Object.keys(state.balances)) if (isSampleId(key)) delete state.balances[key];
  delete state.sample;
  return before - (state.users.length + state.challenges.length + state.pledges.length);
}

/** Writes the history into the store. Removes an earlier sample first. */
export function addSampleHistory(state: Db, now = Date.now()): SampleHistory {
  removeSample(state);
  const history = buildSampleHistory(now, state.users);
  state.users.push(...history.users);
  state.challenges.push(...history.challenges);
  state.pledges.push(...history.pledges);
  state.suggestions.push(...history.suggestions);
  state.invites.push(...history.invites);
  for (const e of history.events) state.events.push({ ...e, seq: ++state.seq });
  Object.assign(state.balances, history.balances);
  state.sample = { challengeIds: [], addedAt: now };
  return history;
}
