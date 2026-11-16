import {
  type Challenge,
  type Evidence,
  GAMES,
  type Pledge,
  type Verdict,
  canLock,
  canSettle,
  describeCondition,
  formatUsd,
  growthOf,
  parseCondition,
  type Split,
  splitPot,
  splitsError,
  pledgeError,
  refundReason,
  toMicro,
} from "@potted/core";
import { type Deps, defaultDeps, snapshot, verify } from "@potted/verifier";
import { ledger } from "./ledger";
import { VOICES, type VoiceKey } from "./voices";
import {
  DEFAULT_SETTINGS,
  type EventType,
  type OverlayPosition,
  type Role,
  type StreamEvent,
  type StreamSettings,
  type Invite,
  type Suggestion,
  type User,
  db,
  newId,
  save,
} from "./store";

/**
 * The use cases. Pages and API routes call these; nothing else touches the
 * store or the ledger. Each function checks who is acting.
 */

const FAUCET_MICRO = toMicro(25);
/** Time the verifier has after the deadline before refunds open to anyone. */
const SETTLE_GRACE_MS = 10 * 60_000;
/** Don't ask a game API about the same challenge more often than this. */
const CHECK_INTERVAL_MS = 8_000;

const lastChecked = new Map<string, number>();

function fail(message: string): never {
  throw new Error(message);
}

export function getUser(id: string | undefined): User | undefined {
  return id ? db().users.find((u) => u.id === id) : undefined;
}

export function getStreamer(handle: string): User | undefined {
  return db().users.find((u) => u.role === "streamer" && u.handle === handle.toLowerCase());
}

export function getChallenge(id: string): Challenge {
  return db().challenges.find((c) => c.id === id) ?? fail("Challenge not found");
}

/** Finds the challenge behind an on-chain account, once the ledger has given it one. */
export function challengeByLedgerRef(ref: string): Challenge | undefined {
  return db().challenges.find((c) => c.ledgerRef === ref);
}

/** Challenges a streamer appears in: their own and those they guest on. */
export function stageChallenges(streamerId: string): Challenge[] {
  const live = (c: Challenge) => (c.status === "open" || c.status === "locked" ? 0 : 1);
  return db()
    .challenges.filter((c) => streamersOf(c).some((u) => u.id === streamerId))
    .sort((a, b) => live(a) - live(b) || b.createdAt - a.createdAt);
}

export function listStreamers(): User[] {
  return db().users.filter((u) => u.role === "streamer" && u.handle);
}

export function listChallenges(streamerId: string): Challenge[] {
  const live = (c: Challenge) => (c.status === "open" || c.status === "locked" ? 0 : 1);
  return db()
    .challenges.filter((c) => c.streamerId === streamerId)
    .sort((a, b) => live(a) - live(b) || b.createdAt - a.createdAt);
}

export function pledgesFor(challengeId: string): (Pledge & { fanName: string })[] {
  return db()
    .pledges.filter((p) => p.challengeId === challengeId)
    .map((p) => ({ ...p, fanName: getUser(p.userId)?.name ?? "A fan" }));
}

/** One row per fan, for the funders list. */
export function fundersOf(challengeId: string): { userId: string; fanName: string; amountMicro: number; refunded: boolean }[] {
  const byFan = new Map<string, { userId: string; fanName: string; amountMicro: number; refunded: boolean }>();
  for (const p of pledgesFor(challengeId)) {
    const row = byFan.get(p.userId) ?? { userId: p.userId, fanName: p.fanName, amountMicro: 0, refunded: true };
    row.amountMicro += p.amountMicro;
    row.refunded = row.refunded && p.refunded;
    byFan.set(p.userId, row);
  }
  return [...byFan.values()].sort((a, b) => b.amountMicro - a.amountMicro);
}

export interface Plot {
  challenge: Challenge;
  streamerName: string;
  amountMicro: number;
  refunded: boolean;
}

/** Every challenge a fan has backed, newest first, with where the money went. */
export function gardenOf(fan: User): { plots: Plot[]; grown: number; pledgedMicro: number; paidMicro: number; returnedMicro: number } {
  const byChallenge = new Map<string, { amountMicro: number; refundedMicro: number }>();
  for (const p of db().pledges) {
    if (p.userId !== fan.id) continue;
    const row = byChallenge.get(p.challengeId) ?? { amountMicro: 0, refundedMicro: 0 };
    row.amountMicro += p.amountMicro;
    if (p.refunded) row.refundedMicro += p.amountMicro;
    byChallenge.set(p.challengeId, row);
  }
  const plots: Plot[] = [];
  let pledgedMicro = 0;
  let paidMicro = 0;
  let returnedMicro = 0;
  for (const [challengeId, row] of byChallenge) {
    const challenge = db().challenges.find((c) => c.id === challengeId);
    if (!challenge) continue;
    pledgedMicro += row.amountMicro;
    returnedMicro += row.refundedMicro;
    if (challenge.status === "paid") paidMicro += row.amountMicro;
    plots.push({
      challenge,
      streamerName: getUser(challenge.streamerId)?.name ?? "A streamer",
      amountMicro: row.amountMicro,
      refunded: row.refundedMicro === row.amountMicro,
    });
  }
  plots.sort((a, b) => b.challenge.createdAt - a.challenge.createdAt);
  return { plots, grown: plots.filter((p) => p.challenge.status === "paid").length, pledgedMicro, paidMicro, returnedMicro };
}

export async function balanceOf(user: User): Promise<number> {
  return ledger().balanceOf(user.wallet);
}

/** Everyone on stage for a challenge: the host, then any guest streamers. */
export function streamersOf(challenge: Challenge): User[] {
  const ids = [challenge.streamerId, ...(challenge.splits ?? []).flatMap((s) => (s.kind === "guest" && s.userId ? [s.userId] : []))];
  return ids.flatMap((id) => getUser(id) ?? []);
}

/** Names for a sentence: "Ryan", "Ryan and Kai". */
export function namesOf(challenge: Challenge): string {
  return streamersOf(challenge).map((u) => u.name).join(" and ");
}

/** What a streamer takes from a pot of this size: the host's remainder or the guest's share. */
export function shareOf(challenge: Challenge, userId: string, totalMicro = challenge.totalMicro): number {
  const { hostMicro, parts } = splitPot(totalMicro, challenge.splits);
  if (userId === challenge.streamerId) return hostMicro;
  const index = (challenge.splits ?? []).findIndex((s) => s.kind === "guest" && s.userId === userId);
  return index < 0 ? 0 : parts[index]!;
}

/** A challenge's events go to every streamer on it, so each overlay shows them. */
function emit(type: EventType, challenge: Challenge, message: string): void {
  for (const streamer of streamersOf(challenge)) emitTo(streamer.handle ?? "", type, challenge.id, message);
}

function emitTo(handle: string, type: EventType, challengeId: string, message: string): void {
  const state = db();
  const event: StreamEvent = { seq: ++state.seq, at: Date.now(), type, handle, challengeId, message };
  state.events.push(event);
  if (state.events.length > 500) state.events.splice(0, state.events.length - 500);
}

export function eventsSince(handle: string, since: number): StreamEvent[] {
  return db().events.filter((e) => e.handle === handle && e.seq > since);
}

export function latestSeq(): number {
  return db().seq;
}

export function getEvent(seq: number): StreamEvent | undefined {
  return db().events.find((e) => e.seq === seq);
}

/** Judge mode: a named account with test funds, no password. */
export async function signIn(name: string, role: Role): Promise<User> {
  const clean = name.trim().slice(0, 24);
  if (clean.length < 2) fail("Pick a name with at least 2 characters");
  if (role === "streamer") fail("Use the demo streamer account");
  const id = newId("u");
  const user: User = { id, name: clean, role, wallet: `sim:${id}`, createdAt: Date.now() };
  db().users.push(user);
  if (role === "fan") await ledger().faucet(user.wallet, FAUCET_MICRO);
  save();
  return user;
}

export function settingsOf(streamer: User): StreamSettings {
  return { ...DEFAULT_SETTINGS, ...streamer.settings };
}

const POSITIONS: OverlayPosition[] = ["bottom-left", "bottom-right", "top-left", "top-right"];

export async function updateSettings(actor: User, input: Partial<Record<keyof StreamSettings, unknown>>): Promise<StreamSettings> {
  if (actor.role !== "streamer") fail("Only a streamer has stream settings");
  const minPledgeUsd = Number(input.minPledgeUsd);
  if (!(minPledgeUsd >= 0.5 && minPledgeUsd <= 100)) fail("Minimum pledge must be $0.50 to $100");
  const position = String(input.overlayPosition) as OverlayPosition;
  if (!POSITIONS.includes(position)) fail("Unknown overlay position");
  const blockedWords = (Array.isArray(input.blockedWords) ? input.blockedWords : String(input.blockedWords ?? "").split(","))
    .map((word) => String(word).trim().toLowerCase())
    .filter((word) => word.length >= 2 && word.length <= 30)
    .slice(0, 50);
  // Settings saved before voices existed carry no voice; keep the current one.
  const voice = (input.voice ?? settingsOf(actor).voice) as VoiceKey;
  if (!VOICES.some((v) => v.key === voice)) fail("Unknown announcer voice");
  const current = settingsOf(actor);
  const causeOn = input.causeOn === undefined ? current.causeOn : input.causeOn === true;
  const causeName = input.causeName === undefined ? current.causeName : String(input.causeName).trim().replace(/\s+/g, " ");
  const causeUrl = input.causeUrl === undefined ? current.causeUrl : String(input.causeUrl).trim();
  const causePct = input.causePct === undefined ? current.causePct : Number(input.causePct);
  if (causeName.length > 60) fail("Keep the cause's name under 60 characters");
  if (causeUrl && !/^https:\/\/[^\s]+\.[^\s]+$/.test(causeUrl)) fail("The cause's link must start with https://");
  if (causeOn) {
    if (causeName.length < 3) fail("Name the cause before turning the charity stream on");
    const problem = splitsError([{ kind: "cause", name: causeName, pct: causePct }]);
    if (problem) fail(problem);
  }
  actor.settings = {
    causeOn,
    causeName,
    causeUrl,
    causePct: Number.isInteger(causePct) ? causePct : current.causePct,
    acceptingSuggestions: input.acceptingSuggestions === true,
    minPledgeUsd,
    announcer: input.announcer === true,
    voice,
    overlayPosition: position,
    overlayCards: Number(input.overlayCards) === 1 ? 1 : 2,
    // Absent in settings saved before the QR existed; keep the current value then.
    overlayQr: input.overlayQr === undefined ? settingsOf(actor).overlayQr : input.overlayQr === true,
    blockedWords,
  };
  save();
  return settingsOf(actor);
}

const MAX_PENDING_PER_FAN = 3;

/** A fan pitches a challenge. Nothing is funded until the streamer creates it. */
export async function suggest(actor: User, handle: string, gameId: string, text: string): Promise<Suggestion> {
  if (actor.role !== "fan") fail("Sign in as a fan to suggest a challenge");
  const streamer = getStreamer(handle) ?? fail("Streamer not found");
  const settings = settingsOf(streamer);
  if (!settings.acceptingSuggestions) fail(`${streamer.name} is not taking suggestions right now`);
  const game = GAMES.find((g) => g.id === gameId) ?? fail("Unknown game");
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length < 8 || clean.length > 140) fail("Describe the challenge in 8 to 140 characters");
  const lower = clean.toLowerCase();
  if (settings.blockedWords.some((word) => lower.includes(word))) fail("That suggestion uses a word this streamer has blocked");
  const pending = db().suggestions.filter((s) => s.streamerId === streamer.id && s.userId === actor.id && s.status === "pending");
  if (pending.length >= MAX_PENDING_PER_FAN) fail("You already have 3 ideas waiting. Give the streamer a moment");
  const suggestion: Suggestion = {
    id: newId("s"),
    streamerId: streamer.id,
    userId: actor.id,
    fanName: actor.name,
    gameId: game.id,
    text: clean,
    createdAt: Date.now(),
    status: "pending",
  };
  db().suggestions.push(suggestion);
  save();
  return suggestion;
}

export function pendingSuggestions(streamerId: string): Suggestion[] {
  return db()
    .suggestions.filter((s) => s.streamerId === streamerId && s.status === "pending")
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function getSuggestion(id: string): Suggestion | undefined {
  return db().suggestions.find((s) => s.id === id);
}

export async function resolveSuggestion(actor: User, id: string, status: "used" | "dismissed"): Promise<void> {
  const suggestion = getSuggestion(id) ?? fail("Suggestion not found");
  if (suggestion.streamerId !== actor.id) fail("Only the streamer can manage suggestions");
  suggestion.status = status;
  save();
}

export interface NewChallenge {
  gameId: string;
  condition: unknown;
  goalUsd: number;
  pledgeCapUsd: number;
  minutes: number;
}

/** Checks a new challenge's terms and returns the parsed pieces. */
function validate(actor: User, input: NewChallenge) {
  if (actor.role !== "streamer") fail("Only the streamer can create challenges");
  const game = GAMES.find((g) => g.id === input.gameId) ?? fail("Unknown game");
  const condition = parseCondition(input.condition);
  if (condition.kind !== game.verifier) fail("That condition does not match the game");
  if (!(input.minutes >= 1 && input.minutes <= 24 * 60)) fail("Deadline must be 1 minute to 24 hours away");
  if (!(input.goalUsd >= 1 && input.goalUsd <= 10_000)) fail("Goal must be $1 to $10,000");
  if (!(input.pledgeCapUsd >= 1 && input.pledgeCapUsd <= 1_000)) fail("Per-fan limit must be $1 to $1,000");
  return { game, condition };
}

const MAX_PENDING_INVITES = 5;

/**
 * Offers another streamer a share of a challenge. Nothing opens until the
 * guest accepts, so fans never pledge against a split that might change.
 */
export async function invite(actor: User, guestHandle: string, guestPct: number, input: NewChallenge): Promise<Invite> {
  const { condition } = validate(actor, input);
  const guest = getStreamer(String(guestHandle)) ?? fail("No streamer with that handle");
  if (guest.id === actor.id) fail("Pick another streamer to collab with");
  const split: Split = { kind: "guest", userId: guest.id, name: guest.name, pct: Number(guestPct) };
  const problem = splitsError([split, ...causeSplit(actor)]);
  if (problem) fail(problem);
  if (db().invites.filter((i) => i.hostId === actor.id && i.status === "pending").length >= MAX_PENDING_INVITES) {
    fail(`You already have ${MAX_PENDING_INVITES} invites waiting. Withdraw one first.`);
  }
  const record: Invite = {
    id: newId("i"),
    hostId: actor.id,
    guestId: guest.id,
    guestPct: split.pct,
    input: { gameId: input.gameId, condition, goalUsd: input.goalUsd, pledgeCapUsd: input.pledgeCapUsd, minutes: input.minutes },
    title: describeCondition(condition),
    createdAt: Date.now(),
    status: "pending",
  };
  db().invites.push(record);
  save();
  return record;
}

/** Invites waiting on this streamer, and ones they sent that are still waiting. */
export function invitesFor(streamer: User): { incoming: Invite[]; outgoing: Invite[] } {
  const pending = db().invites.filter((i) => i.status === "pending");
  return { incoming: pending.filter((i) => i.guestId === streamer.id), outgoing: pending.filter((i) => i.hostId === streamer.id) };
}

/** The guest answers. Accepting opens the challenge, with the deadline counted from now. */
export async function respondInvite(actor: User, inviteId: string, accept: boolean): Promise<Challenge | undefined> {
  const record = db().invites.find((i) => i.id === inviteId) ?? fail("Invite not found");
  if (record.guestId !== actor.id) fail("Only the invited streamer can answer this");
  if (record.status !== "pending") fail("This invite was already answered");
  if (!accept) {
    record.status = "declined";
    save();
    return undefined;
  }
  const host = getUser(record.hostId) ?? fail("Host not found");
  const challenge = await createChallenge(host, record.input, [{ kind: "guest", userId: actor.id, name: actor.name, pct: record.guestPct }]);
  record.status = "accepted";
  record.challengeId = challenge.id;
  save();
  return challenge;
}

export async function withdrawInvite(actor: User, inviteId: string): Promise<void> {
  const record = db().invites.find((i) => i.id === inviteId) ?? fail("Invite not found");
  if (record.hostId !== actor.id) fail("Only the host can withdraw this");
  if (record.status !== "pending") fail("This invite was already answered");
  record.status = "withdrawn";
  save();
}

/** The cause share a streamer's new challenges carry while their charity stream is on. */
function causeSplit(streamer: User): Split[] {
  const s = settingsOf(streamer);
  return s.causeOn ? [{ kind: "cause", name: s.causeName, pct: s.causePct, ...(s.causeUrl ? { url: s.causeUrl } : {}) }] : [];
}

/** The sim ledger account a cause's share is paid into. */
export function causeWallet(name: string): string {
  return `cause:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

/**
 * What a streamer's stage has sent to a cause, and what is still riding on
 * live challenges. Counted from the challenges themselves, so it cannot
 * drift from what was actually paid.
 */
export function raisedFor(streamer: User, causeName: string): { raisedMicro: number; inPlayMicro: number } {
  let raisedMicro = 0;
  let inPlayMicro = 0;
  for (const c of stageChallenges(streamer.id)) {
    const { parts } = splitPot(c.totalMicro, c.splits);
    (c.splits ?? []).forEach((s, i) => {
      if (s.kind !== "cause" || s.name !== causeName) return;
      if (c.status === "paid") raisedMicro += parts[i]!;
      else if (c.status === "open" || c.status === "locked") inPlayMicro += parts[i]!;
    });
  }
  return { raisedMicro, inPlayMicro };
}

export async function createChallenge(actor: User, input: NewChallenge, guests: Split[] = []): Promise<Challenge> {
  const { game, condition } = validate(actor, input);
  const splits = [...guests, ...causeSplit(actor)];
  const problem = splitsError(splits);
  if (problem) fail(problem);

  const now = Date.now();
  const deadline = now + Math.round(input.minutes * 60_000);
  const disputeMs = condition.kind === "optimistic" ? condition.disputeWindowSecs * 1000 : 0;
  const challenge: Challenge = {
    id: newId("c"),
    streamerId: actor.id,
    title: describeCondition(condition),
    gameId: game.id,
    condition,
    status: "open",
    goalMicro: toMicro(input.goalUsd),
    pledgeCapMicro: toMicro(input.pledgeCapUsd),
    totalMicro: 0,
    createdAt: now,
    deadline,
    settleBy: deadline + disputeMs + SETTLE_GRACE_MS,
    ...(splits.length > 0 ? { splits } : {}),
    txs: {},
  };
  const created = await ledger().createChallenge(challenge, actor.wallet);
  challenge.ledgerRef = created.ref;
  challenge.txs.create = created.tx;
  db().challenges.push(challenge);
  emit("created", challenge, splits.some((s) => s.kind === "guest") ? `New collab with ${namesOf(challenge)}: ${challenge.title}.` : `New challenge: ${challenge.title}.`);
  save();
  return challenge;
}

export async function pledge(actor: User, challengeId: string, amountUsd: number): Promise<Pledge> {
  if (actor.role !== "fan") fail("Sign in as a fan to pledge");
  const challenge = getChallenge(challengeId);
  const amountMicro = toMicro(amountUsd);
  const already = db()
    .pledges.filter((p) => p.challengeId === challengeId && p.userId === actor.id)
    .reduce((sum, p) => sum + p.amountMicro, 0);
  const problem = pledgeError(challenge, already, amountMicro, Date.now());
  if (problem) fail(problem);
  const streamer = getUser(challenge.streamerId);
  const minMicro = toMicro(streamer ? settingsOf(streamer).minPledgeUsd : DEFAULT_SETTINGS.minPledgeUsd);
  if (amountMicro < minMicro) fail(`The smallest pledge on this stream is ${formatUsd(minMicro)}`);

  const tx = await ledger().pledge(challenge, actor.wallet, amountMicro);
  const record: Pledge = {
    id: newId("p"),
    challengeId,
    userId: actor.id,
    amountMicro,
    refunded: false,
    createdAt: Date.now(),
    tx,
  };
  db().pledges.push(record);
  const before = growthOf(challenge.totalMicro, challenge.goalMicro).index;
  challenge.totalMicro += amountMicro;
  emit("pledged", challenge, `${actor.name} added ${formatUsd(amountMicro)}. The pot is at ${formatUsd(challenge.totalMicro)}.`);
  // One line for the highest stage this pledge reached, so a big pledge
  // that jumps two stages is announced once.
  const after = growthOf(challenge.totalMicro, challenge.goalMicro).index;
  const line = after > before ? MILESTONE_LINES[after] : undefined;
  if (line) emit("milestone", challenge, line(challenge));
  save();
  return record;
}

/** Announcer lines by growth stage. The first pledge is its own news, so the sprout has none. */
const MILESTONE_LINES: Record<number, ((c: Challenge) => string) | undefined> = {
  2: () => "The vine is climbing. A third of the way to the clouds.",
  3: () => "That is a proper beanstalk now. Two thirds of the way up.",
  4: (c) => `The beanstalk has reached the clouds! ${formatUsd(c.totalMicro)} is in the pot.`,
};

const RECAP_WINDOW_MS = 12 * 60 * 60_000;

/** A spoken summary of the stream so far: the last 12 hours of this streamer's challenges. */
export function recapText(streamer: User, now = Date.now()): string {
  const recent = stageChallenges(streamer.id).filter((c) => now - c.createdAt <= RECAP_WINDOW_MS);
  if (recent.length === 0) return "No challenges yet this stream.";
  const paid = recent.filter((c) => c.status === "paid");
  const earned = paid.reduce((sum, c) => sum + shareOf(c, streamer.id), 0);
  const ids = new Set(recent.map((c) => c.id));
  const byFan = new Map<string, number>();
  let refunded = 0;
  for (const p of db().pledges) {
    if (!ids.has(p.challengeId)) continue;
    if (p.refunded) refunded += p.amountMicro;
    byFan.set(p.userId, (byFan.get(p.userId) ?? 0) + p.amountMicro);
  }
  const top = [...byFan.entries()].sort((a, b) => b[1] - a[1])[0];
  const parts = [
    `${recent.length} ${recent.length === 1 ? "challenge" : "challenges"} so far, ${paid.length} completed.`,
    `${streamer.name} earned ${formatUsd(earned)}.`,
  ];
  const cause = settingsOf(streamer);
  const raised = cause.causeOn ? raisedFor(streamer, cause.causeName).raisedMicro : 0;
  if (raised > 0) parts.push(`${formatUsd(raised)} raised for ${cause.causeName}.`);
  if (refunded > 0) parts.push(`Fans got ${formatUsd(refunded)} back.`);
  if (top) parts.push(`Biggest backer: ${getUser(top[0])?.name ?? "a fan"}, with ${formatUsd(top[1])}.`);
  return parts.join(" ");
}

/** Sends the recap to the overlay, where the announcer reads it. */
export async function announceRecap(actor: User): Promise<string> {
  if (actor.role !== "streamer" || !actor.handle) fail("Only a streamer can read the recap");
  const text = recapText(actor);
  emitTo(actor.handle, "recap", "", text);
  save();
  return text;
}

function requireOwner(actor: User, challenge: Challenge): void {
  if (actor.id !== challenge.streamerId) fail("Only this challenge's streamer can do that");
}

/** Closes pledging and starts the attempt. Play before this is ignored. */
export async function lock(actor: User, challengeId: string, deps: Deps = defaultDeps()): Promise<Challenge> {
  const challenge = getChallenge(challengeId);
  requireOwner(actor, challenge);
  if (!canLock(challenge, Date.now())) fail("This challenge cannot be started");
  // Taken before the ledger call so a failing game API cannot leave a locked
  // challenge without the baseline it needs.
  const baseline = await snapshot(challenge.condition, deps);
  challenge.txs.lock = await ledger().lock(challenge);
  challenge.baseline = baseline;
  challenge.status = "locked";
  challenge.lockedAt = Date.now();
  emit("locked", challenge, `Pledging is closed. ${formatUsd(challenge.totalMicro)} is riding on this one.`);
  save();
  return challenge;
}

async function refundAll(challenge: Challenge): Promise<number> {
  let count = 0;
  for (const p of db().pledges) {
    if (p.challengeId !== challenge.id || p.refunded) continue;
    const fan = getUser(p.userId);
    if (!fan) continue;
    p.refundTx = await ledger().refund(challenge, fan.wallet, p.amountMicro);
    p.refunded = true;
    count += 1;
  }
  return count;
}

/**
 * The streamer calls a challenge off, before or during the attempt. It can
 * only ever send money back to fans, never to the streamer.
 */
export async function cancel(actor: User, challengeId: string): Promise<Challenge> {
  const challenge = getChallenge(challengeId);
  requireOwner(actor, challenge);
  if (challenge.status !== "open" && challenge.status !== "locked") fail("This challenge is already settled");
  challenge.txs.settle = await ledger().settle(challenge, false, undefined, []);
  challenge.status = "failed";
  challenge.settledAt = Date.now();
  challenge.verdict = { outcome: "failure", reason: "Cancelled by the streamer" };
  const fans = await refundAll(challenge);
  emit(
    "refunded",
    challenge,
    fans > 0 ? `Challenge cancelled. ${fans} ${fans === 1 ? "fan was" : "fans were"} refunded in full.` : "Challenge cancelled.",
  );
  save();
  return challenge;
}

/** Opens a fresh copy of a settled challenge with the same terms and length. */
export async function runAgain(actor: User, challengeId: string): Promise<Challenge> {
  const previous = getChallenge(challengeId);
  requireOwner(actor, previous);
  if (previous.status !== "paid" && previous.status !== "failed") fail("Finish this challenge before running it again");
  // A guest agreed to one run, not to every rerun.
  if (previous.splits?.some((s) => s.kind === "guest")) fail("This was a collab. Send a new invite to run it again.");
  return createChallenge(actor, {
    gameId: previous.gameId,
    condition: previous.condition,
    goalUsd: previous.goalMicro / 1_000_000,
    pledgeCapUsd: previous.pledgeCapMicro / 1_000_000,
    minutes: Math.max(1, Math.round((previous.deadline - previous.createdAt) / 60_000)),
  });
}

/** Who receives what from a successful pot. */
function payoutsOf(challenge: Challenge): { wallet: string; amountMicro: number }[] {
  const host = getUser(challenge.streamerId) ?? fail("Streamer not found");
  const { hostMicro, parts } = splitPot(challenge.totalMicro, challenge.splits);
  const payouts = [{ wallet: host.wallet, amountMicro: hostMicro }];
  (challenge.splits ?? []).forEach((split, index) => {
    const wallet = split.kind === "guest" ? getUser(split.userId ?? "")?.wallet : causeWallet(split.name);
    if (!wallet) fail(`No wallet on file for ${split.name}`);
    payouts.push({ wallet, amountMicro: parts[index]! });
  });
  return payouts;
}

async function applyVerdict(challenge: Challenge, verdict: Verdict): Promise<void> {
  challenge.verdict = verdict;
  if (verdict.outcome === "pending") return;
  const success = verdict.outcome === "success";
  challenge.txs.settle = await ledger().settle(challenge, success, verdict.evidence, payoutsOf(challenge));
  challenge.settledAt = Date.now();
  if (success) {
    challenge.status = "paid";
    const { parts } = splitPot(challenge.totalMicro, challenge.splits);
    const gifts = (challenge.splits ?? []).flatMap((s, i) => (s.kind === "cause" && parts[i]! > 0 ? [`${formatUsd(parts[i]!)} goes to ${s.name}.`] : []));
    const earned = challenge.totalMicro - (challenge.splits ?? []).reduce((sum, s, i) => sum + (s.kind === "cause" ? parts[i]! : 0), 0);
    emit("paid", challenge, [`Challenge complete! ${namesOf(challenge)} earned ${formatUsd(earned)}.`, ...gifts].join(" "));
  } else {
    challenge.status = "failed";
    const fans = await refundAll(challenge);
    emit(
      "failed",
      challenge,
      fans > 0
        ? `Challenge failed. ${formatUsd(challenge.totalMicro)} is going back to ${fans} ${fans === 1 ? "fan" : "fans"}.`
        : "Challenge failed.",
    );
  }
}

/**
 * Asks the verifier for a result and settles if there is one. Safe to call
 * as often as you like; `force` skips the rate limit for a manual check.
 */
export async function check(
  challengeId: string,
  opts: { force?: boolean; deps?: Deps } = {},
): Promise<Challenge> {
  const challenge = getChallenge(challengeId);
  const now = Date.now();

  if (refundReason(challenge, now) === "expired") {
    challenge.status = "failed";
    challenge.verdict = { outcome: "failure", reason: "No result arrived in time, so every pledge was refunded" };
    challenge.settledAt = now;
    const fans = await refundAll(challenge);
    emit("refunded", challenge, `Time ran out. ${fans} ${fans === 1 ? "fan was" : "fans were"} refunded.`);
    save();
    return challenge;
  }
  if (challenge.status !== "locked" || !canSettle(challenge, now)) return challenge;
  if (!opts.force && now - (lastChecked.get(challengeId) ?? 0) < CHECK_INTERVAL_MS) return challenge;
  lastChecked.set(challengeId, now);

  const verdict = await verify(
    challenge.condition,
    {
      lockedAt: challenge.lockedAt ?? challenge.createdAt,
      deadline: challenge.deadline,
      now,
      baseline: challenge.baseline,
      claim: challenge.claim,
    },
    opts.deps ?? defaultDeps(),
  );
  await applyVerdict(challenge, verdict);
  save();
  return challenge;
}

/** Background pass for one streamer's live challenges. Errors are per challenge. */
export async function tick(streamerId: string): Promise<void> {
  for (const challenge of listChallenges(streamerId)) {
    if (challenge.status !== "open" && challenge.status !== "locked") continue;
    try {
      await check(challenge.id);
    } catch (err) {
      challenge.verdict = { outcome: "pending", reason: `Could not check yet: ${(err as Error).message}` };
    }
  }
}

/** Optimistic tier: the streamer says "done" and attaches a clip. */
export async function claim(actor: User, challengeId: string, clipUrl: string): Promise<Challenge> {
  const challenge = getChallenge(challengeId);
  requireOwner(actor, challenge);
  if (challenge.condition.kind !== "optimistic") fail("This challenge is verified from game data");
  if (challenge.status !== "locked") fail("Start the attempt before claiming");
  if (Date.now() > challenge.deadline) fail("The deadline has passed");
  if (challenge.claim) fail("A clip was already posted");
  let url: URL;
  try {
    url = new URL(clipUrl);
  } catch {
    fail("Enter a full clip link");
  }
  if (url.protocol !== "https:") fail("The clip link must start with https://");
  challenge.claim = { clipUrl: url.toString(), claimedAt: Date.now(), disputedBy: [] };
  emit("claimed", challenge, `Clip posted. Funders have ${challenge.condition.disputeWindowSecs} seconds to dispute.`);
  save();
  return challenge;
}

export async function dispute(actor: User, challengeId: string): Promise<Challenge> {
  const challenge = getChallenge(challengeId);
  const funded = db().pledges.some((p) => p.challengeId === challengeId && p.userId === actor.id);
  if (!funded) fail("Only funders of this challenge can dispute");
  const current = challenge.claim ?? fail("There is no claim to dispute");
  if (challenge.status !== "locked" || current.ruling) fail("This claim can no longer be disputed");
  if (!current.disputedBy.includes(actor.id)) current.disputedBy.push(actor.id);
  emit("disputed", challenge, `${actor.name} disputed the clip. A moderator will review it.`);
  save();
  return challenge;
}

export async function rule(actor: User, challengeId: string, upheld: boolean): Promise<Challenge> {
  if (actor.role !== "mod") fail("Only a moderator can rule on disputes");
  const challenge = getChallenge(challengeId);
  const current = challenge.claim ?? fail("There is no claim to rule on");
  if (current.disputedBy.length === 0) fail("Nobody has disputed this claim");
  current.ruling = upheld ? "upheld" : "rejected";
  save();
  return check(challengeId, { force: true });
}

export function simulatedResultsAllowed(): boolean {
  return process.env.POTTED_ALLOW_SIMULATED_RESULTS === "true";
}

/** Rehearsal only. The receipt is permanently marked as simulated. */
export async function simulateResult(actor: User, challengeId: string, success: boolean): Promise<Challenge> {
  if (!simulatedResultsAllowed()) fail("Simulated results are turned off");
  const challenge = getChallenge(challengeId);
  requireOwner(actor, challenge);
  if (challenge.status !== "locked") fail("Start the attempt first");
  const evidence: Evidence = {
    source: "rehearsal",
    ref: "simulated",
    summary: "Result forced from the dashboard for a rehearsal. No game data was checked.",
    simulated: true,
  };
  await applyVerdict(challenge, {
    outcome: success ? "success" : "failure",
    reason: "Simulated result for a rehearsal",
    evidence,
  });
  save();
  return challenge;
}
