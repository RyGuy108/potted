import { type Pitch, type ScoutGame, type ScoutInput, scout } from "@potted/coordinator";
import { type Challenge, GAMES, MAX_USD } from "@potted/core";
import * as service from "./service";
import { type ScoutRun, type User, db, save } from "./store";
import { conditionFromFields } from "./terms";

/**
 * The climber's scout: Grok looks for challenges worth pitching next, from
 * trends on X and the web and from this stream's own record, including the
 * escrow events QuickNode delivered. A pitch opens as a challenge only when
 * the climber clicks it, or when autopilot is on and nothing is live.
 */

const DAY = 24 * 60 * 60_000;
/** How long autopilot waits after opening one before it opens another. */
const AUTOPILOT_GAP_MS = 3 * 60_000;
/** Autopilot asks for fresh pitches when the last run is older than this or used up. */
const RESCOUT_AFTER_MS = 3 * 60 * 60_000;
const MIN_RESCOUT_GAP_MS = 10 * 60_000;

const fail = (message: string): never => {
  throw new Error(message);
};

function ownChallenges(streamer: User): Challenge[] {
  return db().challenges.filter((c) => c.streamerId === streamer.id);
}

/** The account a data-checked game was last played under, so a pitch can reuse it. */
function lastAccount(streamer: User, verifier: string): Record<string, string> | undefined {
  const last = [...ownChallenges(streamer)].reverse().find((c) => c.condition.kind === verifier);
  if (!last) return undefined;
  const c = last.condition;
  if (c.kind === "lichess") return { username: c.username };
  if (c.kind === "fortnite") return { accountName: c.accountName };
  if (c.kind === "brawlstars") return { playerTag: c.playerTag };
  return undefined;
}

/** What QuickNode has reported from the escrow program for this climber in the last day. */
export function chainDigest(streamer: User, now = Date.now()): ScoutInput["chain"] {
  const refs = new Set(ownChallenges(streamer).flatMap((c) => (c.ledgerRef ? [service.chainAccountOf(c.ledgerRef)] : [])));
  const recent = db().chain.filter((e) => refs.has(e.challenge) && (e.at === 0 || now - e.at <= DAY));
  const usd = (micro: unknown) => Number(micro ?? 0) / 1_000_000;
  const pledges = recent.filter((e) => e.name === "Pledged");
  const settled = recent.filter((e) => e.name === "Settled");
  return {
    pledges: pledges.length,
    pledgedUsd: pledges.reduce((sum, e) => sum + usd(e.fields.amount), 0),
    settled: settled.length,
    paidOutUsd: settled.filter((e) => e.fields.success === true).reduce((sum, e) => sum + usd(e.fields.paidOut), 0),
    biggestPotUsd: Math.max(0, ...pledges.map((e) => usd(e.fields.totalPledged))),
  };
}

export function scoutInput(streamer: User, now = Date.now()): ScoutInput {
  const own = ownChallenges(streamer);
  const played = [...new Set(own.map((c) => c.gameId))];
  const accepted = service.settingsOf(streamer).acceptedGames;
  const takes = (id: string) => accepted.length === 0 || accepted.includes(id);
  const ownIds = played.filter(takes);
  const ids = ownIds.length > 0 ? ownIds : GAMES.filter((g) => g.featured && g.id !== "other" && takes(g.id)).map((g) => g.id);
  const games: ScoutGame[] = ids.map((id) => {
    const list = own.filter((c) => c.gameId === id);
    const funded = list.filter((c) => c.totalMicro > 0);
    const fills = list.filter((c) => c.goalMicro > 0).flatMap((c) => {
      let running = 0;
      for (const p of db().pledges.filter((p) => p.challengeId === c.id).sort((a, b) => a.createdAt - b.createdAt)) {
        running += p.amountMicro;
        if (running >= c.goalMicro) return [(p.createdAt - c.createdAt) / 60_000];
      }
      return [];
    });
    const verifier = GAMES.find((g) => g.id === id)?.verifier;
    return {
      id,
      challenges: list.length,
      completed: list.filter((c) => c.status === "paid").length,
      averagePotUsd: funded.length ? funded.reduce((sum, c) => sum + c.totalMicro, 0) / funded.length / 1_000_000 : 0,
      minutesToGoal: fills.length ? Math.round(fills.reduce((a, b) => a + b, 0) / fills.length) : null,
      accountKnown: verifier === "optimistic" || !!(verifier && lastAccount(streamer, verifier)),
    };
  });
  return {
    climber: streamer.name,
    games,
    recent: own.slice(-10).map((c) => c.title),
    fanIdeas: service.pendingSuggestions(streamer.id).slice(0, 5).map((s) => ({ gameId: s.gameId, text: s.text })),
    chain: chainDigest(streamer, now),
    limits: { maxGoalUsd: service.settingsOf(streamer).scoutMaxGoalUsd },
    today: new Date(now).toISOString().slice(0, 10),
  };
}

export function scoutOf(streamerId: string): ScoutRun | undefined {
  return db().scouts?.[streamerId];
}

const inFlight = new Set<string>();

/** Asks the scout for fresh pitches. One run per climber at a time. */
export async function runScout(actor: User): Promise<ScoutRun> {
  if (actor.role !== "streamer") fail("Only a climber has a scout");
  if (inFlight.has(actor.id)) fail("The scout is already looking. Give it a moment.");
  inFlight.add(actor.id);
  try {
    const input = scoutInput(actor);
    const result = await scout(input);
    // Grok searches widely; keep only the challenge types this climber takes.
    const settings = service.settingsOf(actor);
    const run: ScoutRun = { ...result, pitches: result.pitches.filter((p) => service.takesGame(settings, p.gameId)), at: Date.now(), opened: {}, chain: input.chain };
    (db().scouts ??= {})[actor.id] = run;
    save();
    return run;
  } finally {
    inFlight.delete(actor.id);
  }
}

/** The form values a pitch fills in: its terms plus the climber's account for data-checked games. */
export function pitchFields(streamer: User, pitch: Pitch): Record<string, string> {
  const verifier = GAMES.find((g) => g.id === pitch.gameId)?.verifier ?? "optimistic";
  return {
    ...(verifier === "optimistic" ? { disputeWindowSecs: "120", proof: "The clip shows the whole attempt, start to finish" } : {}),
    ...(lastAccount(streamer, verifier) ?? {}),
    ...pitch.fields,
    goalUsd: String(pitch.goalUsd),
    pledgeCapUsd: String(pitch.capUsd),
    minutes: String(pitch.minutes),
    upfrontPct: String(pitch.upfrontPct),
  };
}

/** Opens a pitch as a challenge, through the same checks as the form. */
export async function openPitch(actor: User, index: number, by: "climber" | "autopilot" = "climber"): Promise<Challenge> {
  if (actor.role !== "streamer") fail("Only a climber can open a pitch");
  const run = scoutOf(actor.id) ?? fail("Run the scout first");
  const pitch = run.pitches[index] ?? fail("That pitch is gone. Run the scout again.");
  if (run.opened[index]) fail("That pitch is already open");
  const settings = service.settingsOf(actor);
  if (pitch.goalUsd > settings.scoutMaxGoalUsd) fail(`That goal is over your scout limit of $${settings.scoutMaxGoalUsd}`);
  const f = pitchFields(actor, pitch);
  const challenge = await service.createChallenge(actor, {
    gameId: pitch.gameId,
    condition: conditionFromFields(pitch.gameId, f),
    goalUsd: pitch.goalUsd,
    pledgeCapUsd: pitch.capUsd,
    minutes: pitch.minutes,
    upfrontPct: pitch.upfrontPct,
  });
  run.opened[index] = challenge.id;
  if (by === "autopilot") {
    run.autoAt = Date.now();
    service.announce("created", challenge, `The scout picked this one. ${pitch.hook}`);
  }
  save();
  return challenge;
}

export async function setAutopilot(actor: User, on: boolean, maxGoalUsd: number): Promise<void> {
  if (actor.role !== "streamer") fail("Only a climber has a scout");
  if (!(Number.isInteger(maxGoalUsd) && maxGoalUsd >= 5 && maxGoalUsd <= MAX_USD)) fail(`The scout's goal limit must be a whole $5 to $${MAX_USD}`);
  actor.settings = { ...service.settingsOf(actor), autopilot: on, scoutMaxGoalUsd: maxGoalUsd };
  save();
}

/**
 * Called whenever the overlay or dashboard polls. With autopilot on and
 * nothing live, it opens the scout's next pitch within the climber's limit,
 * and asks for fresh pitches when the last run is old or used up.
 */
export async function autopilotTick(streamer: User, now = Date.now()): Promise<Challenge | undefined> {
  const settings = service.settingsOf(streamer);
  if (!settings.autopilot) return undefined;
  const live = ownChallenges(streamer).some((c) => c.status === "open" || c.status === "locked");
  if (live) return undefined;
  const run = scoutOf(streamer.id);
  const next = run?.pitches.findIndex((p, i) => !run.opened[i] && p.goalUsd <= settings.scoutMaxGoalUsd) ?? -1;
  if (!run || next < 0 || now - run.at > RESCOUT_AFTER_MS) {
    // Look again in the background; the next poll picks the result up. Never
    // more than once every few minutes, so a run with nothing usable does not loop.
    if (!inFlight.has(streamer.id) && (!run || now - run.at > MIN_RESCOUT_GAP_MS)) void runScout(streamer).catch(() => {});
    return undefined;
  }
  if (run.autoAt && now - run.autoAt < AUTOPILOT_GAP_MS) return undefined;
  return openPitch(streamer, next, "autopilot");
}
