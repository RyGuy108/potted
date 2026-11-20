import { accountEmail, accountsWithEmail, EmailLinkRequired, importProfile, verifiedAccountEmail } from "./account";
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
  isOpenPot,
  OPEN_POT_CAP_MICRO,
  parseCondition,
  type Split,
  splitPot,
  splitsError,
  MAX_UPFRONT_PCT,
  keptOnRefund,
  upfrontOf,
  pledgeError,
  refundReason,
  toMicro,
} from "@potted/core";
import { keeperCodeConfigured, keeperCodeOk } from "./keeper-code";
import { type Deps as CoordinatorDeps, type PledgeFacts, type RecapFacts, commentOnPledge, defaultDeps as coordinatorDeps, draftRecap } from "@potted/coordinator";
import { type Deps, defaultDeps, snapshot, verify } from "@potted/verifier";
import * as notifications from "./notifications";
import { isSimTx, ledger } from "./ledger";
import { type StreamInfo, type StreamLink, gameFor, lookupStream, parseStreamLink } from "./streams";
import { createPrivyWallet, privyConfigured } from "./privy";
import { LANGUAGES, VOICES, type VoiceKey } from "./voices";
import {
  DEFAULT_SETTINGS,
  type EventType,
  type OverlayPosition,
  type LiveSession,
  type Role,
  type StreamEvent,
  type StreamSettings,
  type Backing,
  type Bounty,
  type Campaign,
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

const CHANNEL_KEYS = { twitch: "twitchChannel", youtube: "youtubeChannel", kick: "kickChannel" } as const;

/** The climber who linked this Twitch, YouTube or Kick channel in their settings. */
export function streamerByChannel(platform: "twitch" | "youtube" | "kick", name: string): User | undefined {
  const clean = name.trim().toLowerCase().replace(/^@/, "");
  if (!clean) return undefined;
  return listStreamers().find((s) => settingsOf(s)[CHANNEL_KEYS[platform]] === clean);
}

/** A session counts as live for 12 hours after it starts, unless ended sooner. */
const SESSION_MS = 12 * 60 * 60_000;

/** The stream a climber is on right now, if they said they started one. */
export function liveSessionOf(streamer: User, now = Date.now()): LiveSession | undefined {
  const s = streamer.liveSession;
  return s && now - s.startedAt < SESSION_MS ? s : undefined;
}

/**
 * A climber starts a stream by pasting its link. Potted links that channel
 * to their account (so the extension knows the tab), and keeps the title
 * and game the platform reports, to fill in their next challenge.
 */
export async function goLive(actor: User, link: string, lookup: (l: StreamLink) => Promise<StreamInfo> = lookupStream, now = Date.now()): Promise<LiveSession> {
  if (actor.role !== "streamer") fail("Only a climber can go live");
  const parsed = parseStreamLink(link);
  const info = await lookup(parsed);
  const key = CHANNEL_KEYS[parsed.platform];
  if (parsed.channel) {
    const other = streamerByChannel(parsed.platform, parsed.channel);
    if (other && other.id !== actor.id) fail("Another climber has already linked that channel");
  }
  const game = gameFor(info.category, info.title);
  const session: LiveSession = {
    platform: parsed.platform,
    channel: parsed.channel,
    url: parsed.url,
    ...(info.title ? { title: info.title.slice(0, 140) } : {}),
    ...(info.category ? { category: info.category.slice(0, 60) } : {}),
    gameId: game.gameId,
    ...(game.customGame ? { customGame: game.customGame } : {}),
    startedAt: now,
  };
  actor.liveSession = session;
  if (parsed.channel) actor.settings = { ...settingsOf(actor), [key]: parsed.channel };
  save();
  return session;
}

export function endStream(actor: User): void {
  if (actor.role !== "streamer") fail("Only a climber can end a stream");
  delete actor.liveSession;
  save();
}

export function getChallenge(id: string): Challenge {
  return db().challenges.find((c) => c.id === id) ?? fail("Challenge not found");
}

/** Finds the challenge behind an on-chain account, once the ledger has given it one. */
export function challengeByLedgerRef(ref: string): Challenge | undefined {
  // Solana refs are "<challenge account>:<streamer wallet>"; chain events name the account.
  return db().challenges.find((c) => c.ledgerRef === ref || c.ledgerRef?.startsWith(`${ref}:`));
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
export function pledgeById(pledgeId: string): Pledge | undefined {
  return db().pledges.find((p) => p.id === pledgeId);
}

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
    row.refundedMicro += returnedOf(p);
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
/** Puts a line on the climber's overlay feed for a challenge; the announcer reads it out. */
export function announce(type: EventType, challenge: Challenge, message: string): void {
  emit(type, challenge, message);
}

type EventExtra = Pick<StreamEvent, "sfx" | "by" | "chain" | "about"> & {
  /** Keep the line off the overlay until the QuickNode Stream delivers this transaction. */
  hold?: boolean;
};

function emit(type: EventType, challenge: Challenge, message: string, extra: EventExtra = {}): void {
  for (const streamer of streamersOf(challenge)) {
    emitTo(streamer.handle ?? "", type, challenge.id, message, extra);
    // The chat bot posts the big moments in the streamer's connected chats. Not awaited.
    void Promise.all([import("./chat-bot"), import("./chat-replies")]).then(([{ announce, announcementFor }, { announcementKind }]) => {
      const text = announcementFor(type, message, streamer, extra.sfx);
      if (text) return announce(streamer, text, Date.now(), announcementKind(type, extra.sfx));
    }).catch(() => undefined);
  }
  notifications.onChallengeEvent(type, challenge, message);
}

/** Lines waiting for the QuickNode Stream. Kept in memory: after a restart they are simply not shown. */
const heldEvents = ((globalThis as { __pottedHeld?: StreamEvent[] }).__pottedHeld ??= []);

/** How long a line waits for the Stream before it is shown anyway. */
export const HOLD_MS = 12_000;

function emitTo(handle: string, type: EventType, challengeId: string, message: string, extra: EventExtra = {}): void {
  const state = db();
  const { hold, ...rest } = extra;
  const event: StreamEvent = { seq: 0, at: Date.now(), type, handle, challengeId, message, ...rest };
  if (hold && event.chain) {
    heldEvents.push(event);
    return;
  }
  publish(event);
}

function publish(event: StreamEvent): void {
  const state = db();
  event.seq = ++state.seq;
  state.events.push(event);
  if (state.events.length > 500) state.events.splice(0, state.events.length - 500);
}

/** The QuickNode Stream delivered this transaction: put its held lines on the overlay, stamped with when it arrived. */
export function releaseChainEvents(signature: string, streamAt = Date.now()): number {
  let released = 0;
  for (let i = 0; i < heldEvents.length; ) {
    const event = heldEvents[i]!;
    if (event.chain?.signature === signature) {
      heldEvents.splice(i, 1);
      event.chain = { ...event.chain, streamAt };
      publish(event);
      released++;
    } else i++;
  }
  if (released) save();
  return released;
}

/** Lines the Stream never delivered go on screen anyway after a short wait, without a speed. */
export function releaseStaleEvents(now = Date.now()): void {
  let released = 0;
  for (let i = 0; i < heldEvents.length; ) {
    if (now - heldEvents[i]!.at >= HOLD_MS) {
      publish(heldEvents.splice(i, 1)[0]!);
      released++;
    } else i++;
  }
  if (released) save();
}

/** Whether pledge lines wait for the QuickNode Stream: only on Solana, with a Stream set up. */
export function streamsCarryPledges(): boolean {
  // Tests run on the simulated ledger and exercise the hold with a fake Stream.
  return Boolean(process.env.QUICKNODE_WEBHOOK_SECRET) && (ledger().kind === "solana" || process.env.VITEST === "true");
}

/** A stream-wide line on a climber's overlay, not tied to a challenge. */
export function announceStream(handle: string, type: EventType, message: string): void {
  emitTo(handle, type, "", message);
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
  const user: User = { id, name: clean, role, wallet: ledger().newWallet(id), createdAt: Date.now() };
  db().users.push(user);
  if (role === "fan") await ledger().faucet(user.wallet, FAUCET_MICRO);
  save();
  return user;
}

/** Judge mode for climbers: a new stream with its own address, no password. */
export async function signUpClimber(name: string, handle: string): Promise<User> {
  const clean = name.trim().slice(0, 24);
  if (clean.length < 2) fail("Pick a name with at least 2 characters");
  const id = newId("u");
  const user: User = { id, name: clean, role: "streamer", handle: claimableHandle(handle), wallet: ledger().newWallet(id), createdAt: Date.now() };
  db().users.push(user);
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
  if (!(minPledgeUsd >= 0.5 && minPledgeUsd <= 500)) fail("Minimum pledge must be $0.50 to $500");
  const position = String(input.overlayPosition) as OverlayPosition;
  if (!POSITIONS.includes(position)) fail("Unknown overlay position");
  const blockedWords = (Array.isArray(input.blockedWords) ? input.blockedWords : String(input.blockedWords ?? "").split(","))
    .map((word) => String(word).trim().toLowerCase())
    .filter((word) => word.length >= 2 && word.length <= 30)
    .slice(0, 50);
  // Settings saved before voices existed carry no voice; keep the current one.
  const current = settingsOf(actor);
  const voice = (input.voice ?? current.voice) as VoiceKey | "own";
  if (voice === "own" ? !current.ownVoice : !VOICES.some((v) => v.key === voice)) fail(voice === "own" ? "Clone your voice before choosing it" : "Unknown announcer voice");
  const language = input.language === undefined ? current.language : String(input.language);
  if (!LANGUAGES.some((l) => l.code === language)) fail("Unknown announcer language");
  const causeOn = input.causeOn === undefined ? current.causeOn : input.causeOn === true;
  const causeName = input.causeName === undefined ? current.causeName : String(input.causeName).trim().replace(/\s+/g, " ");
  const causeUrl = input.causeUrl === undefined ? current.causeUrl : String(input.causeUrl).trim();
  const causePct = input.causePct === undefined ? current.causePct : Number(input.causePct);
  if (causeName.length > 60) fail("Keep the cause's name under 60 characters");
  if (causeUrl && !/^https:\/\/[^\s]+\.[^\s]+$/.test(causeUrl)) fail("The cause's link must start with https://");
  const causeWalletAddress = input.causeWallet === undefined ? current.causeWallet : String(input.causeWallet).trim();
  if (causeWalletAddress && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(causeWalletAddress)) fail("The cause's wallet must be a Solana address");
  if (causeOn) {
    if (causeName.length < 3) fail("Name the cause before turning the charity stream on");
    const problem = splitsError([{ kind: "cause", name: causeName, pct: causePct }]);
    if (problem) fail(problem);
  }
  const channel = (value: unknown, fallback: string): string => {
    if (value === undefined) return fallback;
    const clean = String(value).trim().toLowerCase().replace(/^@/, "");
    if (clean && !/^[a-z0-9_.-]{2,40}$/.test(clean)) fail("Channel names use letters, numbers, dots, dashes and underscores");
    return clean;
  };
  const twitchChannel = channel(input.twitchChannel, current.twitchChannel);
  const youtubeChannel = channel(input.youtubeChannel, current.youtubeChannel);
  const kickChannel = channel(input.kickChannel, current.kickChannel);
  for (const other of listStreamers()) {
    if (other.id === actor.id) continue;
    const theirs = settingsOf(other);
    if (
      (twitchChannel && theirs.twitchChannel === twitchChannel) ||
      (youtubeChannel && theirs.youtubeChannel === youtubeChannel) ||
      (kickChannel && theirs.kickChannel === kickChannel)
    ) {
      fail("Another climber has already linked that channel");
    }
  }
  actor.settings = {
    acceptingBounties: input.acceptingBounties === undefined ? current.acceptingBounties : input.acceptingBounties === true,
    twitchChannel,
    youtubeChannel,
    kickChannel,
    causeOn,
    causeName,
    causeUrl,
    causeWallet: causeWalletAddress,
    causePct: Number.isInteger(causePct) ? causePct : current.causePct,
    acceptingSuggestions: input.acceptingSuggestions === true,
    minPledgeUsd,
    announcer: input.announcer === true,
    voice,
    ownVoice: current.ownVoice,
    language,
    chatBot: input.chatBot === undefined ? current.chatBot !== false : Boolean(input.chatBot),
    overlayPosition: position,
    overlayCards: Number(input.overlayCards) === 1 ? 1 : 2,
    // Absent in settings saved before the QR existed; keep the current value then.
    overlayQr: input.overlayQr === undefined ? settingsOf(actor).overlayQr : input.overlayQr === true,
    overlayCommentary: input.overlayCommentary === undefined ? current.overlayCommentary !== false : input.overlayCommentary === true,
    blockedWords,
    autopilot: input.autopilot === undefined ? current.autopilot : input.autopilot === true,
    scoutMaxGoalUsd: current.scoutMaxGoalUsd,
    acceptedGames:
      input.acceptedGames === undefined
        ? current.acceptedGames
        : [...new Set((Array.isArray(input.acceptedGames) ? input.acceptedGames : []).map(String))].filter((id) => GAMES.some((g) => g.id === id)),
  };
  save();
  return settingsOf(actor);
}

/** Whether a streamer takes ideas, bounties and scout pitches for a game. An empty list means every game. */
export function takesGame(settings: StreamSettings, gameId: string): boolean {
  return settings.acceptedGames.length === 0 || settings.acceptedGames.includes(gameId);
}

const MAX_PENDING_PER_FAN = 3;

/** A fan pitches a challenge. Nothing is funded until the streamer creates it. */
export async function suggest(actor: User, handle: string, gameId: string, text: string, customGame = ""): Promise<Suggestion> {
  if (actor.role !== "fan") fail("Sign in as a fan to suggest a challenge");
  const streamer = getStreamer(handle) ?? fail("Streamer not found");
  const settings = settingsOf(streamer);
  if (!settings.acceptingSuggestions) fail(`${streamer.name} is not taking suggestions right now`);
  const game = GAMES.find((g) => g.id === gameId) ?? fail("Unknown game");
  if (!takesGame(settings, game.id)) fail(`${streamer.name} is not taking ${game.name} challenges`);
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length < 8 || clean.length > 140) fail("Describe the challenge in 8 to 140 characters");
  // A fan can name a game the platform has no entry for; it rides on the clip tier.
  const named = game.id === "other" ? customGame.trim().replace(/\s+/g, " ") : "";
  if (named.length > 40) fail("Keep the game's name under 40 characters");
  const lower = `${clean} ${named}`.toLowerCase();
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
    ...(named ? { customGame: named } : {}),
    createdAt: Date.now(),
    status: "pending",
  };
  db().suggestions.push(suggestion);
  notifications.onIdea(streamer.id, actor.name, clean);
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
  /** Whole percent of the pot paid when the attempt starts, 0 to 50. */
  upfrontPct?: number;
  /** An open pot: no goal and no per-fan limit; anyone can keep adding until it settles. Goal and limit are ignored. */
  open?: boolean;
}

/** Checks a new challenge's terms and returns the parsed pieces. */
function validate(actor: User, input: NewChallenge) {
  if (actor.role !== "streamer") fail("Only the streamer can create challenges");
  const game = GAMES.find((g) => g.id === input.gameId) ?? fail("Unknown game");
  const condition = parseCondition(input.condition);
  if (condition.kind !== game.verifier) fail("That condition does not match the game");
  if (!(input.minutes >= 1 && input.minutes <= 24 * 60)) fail("Deadline must be 1 minute to 24 hours away");
  if (!input.open) {
    if (!(input.goalUsd >= 1 && input.goalUsd <= 10_000)) fail("Goal must be $1 to $10,000");
    if (!(input.pledgeCapUsd >= 1 && input.pledgeCapUsd <= 1_000)) fail("Per-fan limit must be $1 to $1,000");
  }
  const upfront = Number(input.upfrontPct ?? 0);
  if (!Number.isInteger(upfront) || upfront < 0 || upfront > MAX_UPFRONT_PCT) fail(`The up-front share must be a whole percent from 0 to ${MAX_UPFRONT_PCT}`);
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
    input: {
      gameId: input.gameId,
      condition,
      goalUsd: input.goalUsd,
      pledgeCapUsd: input.pledgeCapUsd,
      minutes: input.minutes,
      ...(Number(input.upfrontPct ?? 0) > 0 ? { upfrontPct: Number(input.upfrontPct) } : {}),
      ...(input.open ? { open: true } : {}),
    },
    title: describeCondition(condition),
    createdAt: Date.now(),
    status: "pending",
  };
  db().invites.push(record);
  notifications.onInvite(record.guestId, actor.name, record.title);
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
    notifications.onInviteAnswered(record.hostId, actor.name, false, record.title);
    save();
    return undefined;
  }
  const host = getUser(record.hostId) ?? fail("Host not found");
  const challenge = await createChallenge(host, record.input, [{ kind: "guest", userId: actor.id, name: actor.name, pct: record.guestPct }]);
  record.status = "accepted";
  record.challengeId = challenge.id;
  notifications.onInviteAnswered(record.hostId, actor.name, true, record.title, challenge.id);
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
  return s.causeOn
    ? [{ kind: "cause", name: s.causeName, pct: s.causePct, ...(s.causeUrl ? { url: s.causeUrl } : {}), ...(s.causeWallet && ledger().kind === "solana" ? { wallet: s.causeWallet } : {}) }]
    : [];
}

/** The sim ledger account a cause's share is paid into. */
export function causeWallet(name: string): string {
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (ledger().kind === "sim") return `cause:${key}`;
  // Causes have no verified wallet yet, so on Solana each named cause gets
  // one held by this server. Fine for devnet test tokens; a real cause
  // needs its own address before real money goes to it.
  const wallets = db().causeWallets;
  if (!wallets[key]) {
    wallets[key] = ledger().newWallet(`cause:${key}`);
    save();
  }
  return wallets[key];
}

/**
 * What a streamer's stage has sent to a cause, and what is still riding on
 * live challenges. Counted from the challenges themselves, so it cannot
 * drift from what was actually paid.
 */
export function raisedFor(streamer: User, causeName: string): { raisedMicro: number; inPlayMicro: number; confirmedMicro: number } {
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
  const wallet = causeWalletFor(streamer);
  return { raisedMicro, inPlayMicro, confirmedMicro: wallet ? confirmedForCause(wallet) : 0 };
}

/** The wallet a streamer's cause is paid into on Solana: the cause's own, or the one this server holds for it. */
export function causeWalletFor(streamer: User): string | undefined {
  const s = settingsOf(streamer);
  if (!s.causeOn) return undefined;
  if (s.causeWallet) return s.causeWallet;
  if (ledger().kind !== "solana") return undefined;
  return db().causeWallets[s.causeName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")];
}

/** Every cause wallet the charity Stream should watch. */
export function allCauseWallets(): string[] {
  const wallets = new Set(Object.values(db().causeWallets));
  for (const streamer of listStreamers()) {
    const w = settingsOf(streamer).causeWallet;
    if (w) wallets.add(w);
  }
  return [...wallets];
}

/** USDC the charity Stream has seen arrive at this wallet. */
export function confirmedForCause(wallet: string): number {
  return db().causeReceipts.filter((r) => r.wallet === wallet).reduce((sum, r) => sum + r.amountMicro, 0);
}

/**
 * Books USDC the charity Stream saw reach a cause's wallet, once each, and
 * puts a line on the overlay of every stage that gives to that cause.
 */
export function recordCauseReceipts(entries: { signature: string; wallet: string; amountMicro: number; slot: number; at: number }[]): number {
  const state = db();
  const seen = new Set(state.causeReceipts.map((r) => r.key));
  let stored = 0;
  for (const e of entries) {
    const key = `${e.signature}:${e.wallet}`;
    if (seen.has(key)) continue;
    seen.add(key);
    state.causeReceipts.push({ key, ...e });
    stored++;
    for (const streamer of listStreamers()) {
      if (causeWalletFor(streamer) !== e.wallet || !streamer.handle) continue;
      const s = settingsOf(streamer);
      emitTo(streamer.handle, "charity", "", `${formatUsd(e.amountMicro)} just reached ${s.causeName}, confirmed on Solana. ${formatUsd(confirmedForCause(e.wallet))} so far.`, {
        chain: { signature: e.signature, confirmedAt: e.at || Date.now(), streamAt: Date.now() },
      });
    }
  }
  if (state.causeReceipts.length > 2000) state.causeReceipts.splice(0, state.causeReceipts.length - 2000);
  if (stored) save();
  return stored;
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
    goalMicro: input.open ? 0 : toMicro(input.goalUsd),
    pledgeCapMicro: input.open ? OPEN_POT_CAP_MICRO : toMicro(input.pledgeCapUsd),
    totalMicro: 0,
    createdAt: now,
    deadline,
    settleBy: deadline + disputeMs + SETTLE_GRACE_MS,
    ...(Number(input.upfrontPct ?? 0) > 0 ? { upfrontPct: Number(input.upfrontPct) } : {}),
    ...(splits.length > 0 ? { splits } : {}),
    txs: {},
  };
  const created = await ledger().createChallenge(challenge, actor.wallet, shareWalletsOf(challenge));
  challenge.ledgerRef = created.ref;
  challenge.txs.create = created.tx;
  const campaign = activeCampaign(actor.id);
  if (campaign) challenge.campaignId = campaign.id;
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
  // An open pot has no per-fan limit; one pledge still stops at $10,000.
  if (isOpenPot(challenge) && amountMicro > toMicro(10_000)) fail("One pledge can be up to $10,000");
  const streamer = getUser(challenge.streamerId);
  const minMicro = toMicro(streamer ? settingsOf(streamer).minPledgeUsd : DEFAULT_SETTINGS.minPledgeUsd);
  if (amountMicro < minMicro) fail(`The smallest pledge on this stream is ${formatUsd(minMicro)}`);

  const tx = await ledger().pledge(challenge, actor.wallet, amountMicro);
  const record = applyPledge(challenge, actor, amountMicro, tx, { confirmedAt: Date.now(), hold: streamsCarryPledges() });
  save();
  return record;
}

/**
 * Books a pledge that is already on the ledger and announces it. On Solana
 * the lines carry the transaction, so the overlay can show how fast the
 * QuickNode Stream got it on screen.
 */
function applyPledge(challenge: Challenge, actor: User, amountMicro: number, tx: string, timing: { confirmedAt: number; streamAt?: number; hold?: boolean }): Pledge {
  const record: Pledge = {
    id: newId("p"),
    challengeId: challenge.id,
    userId: actor.id,
    amountMicro,
    refunded: false,
    createdAt: Date.now(),
    tx,
  };
  const earlier = db().pledges.filter((p) => p.challengeId === challenge.id && !p.refunded);
  db().pledges.push(record);
  const before = growthOf(challenge.totalMicro, challenge.goalMicro).index;
  const ratioBefore = challenge.goalMicro > 0 ? challenge.totalMicro / challenge.goalMicro : 0;
  challenge.totalMicro += amountMicro;
  const onChain = !isSimTx(tx);
  const chain = onChain ? { signature: tx, confirmedAt: timing.confirmedAt, ...(timing.streamAt ? { streamAt: timing.streamAt } : {}) } : undefined;
  const extra: EventExtra = chain ? { chain, hold: Boolean(timing.hold) && !timing.streamAt } : {};
  emit("pledged", challenge, `${actor.name} added ${formatUsd(amountMicro)}. The pot is at ${formatUsd(challenge.totalMicro)}.`, extra);
  void commentOn(challenge, actor, record, earlier, chain);
  // One line for the highest stage this pledge reached, so a big pledge
  // that jumps two stages is announced once. Crossing half way or the goal
  // also plays a sound effect before the line.
  const after = growthOf(challenge.totalMicro, challenge.goalMicro).index;
  const ratioAfter = challenge.goalMicro > 0 ? challenge.totalMicro / challenge.goalMicro : 0;
  const sfx = ratioBefore < 1 && ratioAfter >= 1 ? "goal" : ratioBefore < 0.5 && ratioAfter >= 0.5 ? "half" : undefined;
  const line = after > before ? (isOpenPot(challenge) ? OPEN_POT_LINES : MILESTONE_LINES)[after] : undefined;
  if (line) emit("milestone", challenge, line(challenge), { ...extra, ...(sfx ? { sfx } : {}) });
  else if (sfx === "half") emit("milestone", challenge, `Half way there! ${formatUsd(challenge.totalMicro)} of ${formatUsd(challenge.goalMicro)}.`, { ...extra, sfx });
  return record;
}

/** One aside per streamer every few seconds at most, so a burst of pledges does not flood the overlay or Grok. */
const lastAside = ((globalThis as { __pottedAside?: Map<string, number> }).__pottedAside ??= new Map());
const ASIDE_EVERY_MS = 8_000;

/** What the commentator may say about a pledge: only facts from our records. */
export function pledgeFacts(challenge: Challenge, actor: User, pledge: Pledge, earlier: Pledge[], now = Date.now()): PledgeFacts {
  const streamer = getUser(challenge.streamerId);
  const planters = new Set([...earlier.map((p) => p.userId), actor.id]).size;
  const sameStreamer = new Set(db().challenges.filter((c) => c.streamerId === challenge.streamerId).map((c) => c.id));
  const tonight = db().pledges.filter((p) => p.userId === actor.id && sameStreamer.has(p.challengeId) && now - p.createdAt < 12 * 3_600_000).length;
  const short = challenge.goalMicro - challenge.totalMicro;
  const minutes = Math.ceil((challenge.settleBy - now) / 60_000);
  return {
    planter: actor.name,
    streamer: streamer?.name ?? "the streamer",
    title: challenge.title,
    amount: formatUsd(pledge.amountMicro),
    pot: formatUsd(challenge.totalMicro),
    ...(challenge.goalMicro > 0 ? { goal: formatUsd(challenge.goalMicro) } : {}),
    ...(challenge.goalMicro > 0 && short > 0 ? { toGo: formatUsd(short) } : {}),
    planters,
    planterPledgesTonight: Math.max(1, tonight),
    firstOnChallenge: earlier.length === 0,
    biggestOnChallenge: earlier.length > 0 && earlier.every((p) => p.amountMicro < pledge.amountMicro),
    ...(challenge.status === "open" || challenge.status === "locked" ? (minutes > 0 && minutes <= 60 ? { minutesLeft: minutes } : {}) : {}),
  };
}

/**
 * Puts Grok's one-line aside on the overlay, under the pledge it reacts to.
 * Not awaited by the pledge: Grok can take a few seconds. If the pledge line
 * is still waiting for the QuickNode Stream, the aside waits with it.
 */
async function commentOn(challenge: Challenge, actor: User, pledge: Pledge, earlier: Pledge[], chain: StreamEvent["chain"], deps: CoordinatorDeps = coordinatorDeps()): Promise<void> {
  try {
    const streamers = streamersOf(challenge).filter((s) => s.handle && settingsOf(s).overlayCommentary !== false);
    if (streamers.length === 0) return;
    const key = challenge.streamerId;
    const now = Date.now();
    if (now - (lastAside.get(key) ?? 0) < ASIDE_EVERY_MS) return;
    lastAside.set(key, now);
    const aside = await commentOnPledge(pledgeFacts(challenge, actor, pledge, earlier, now), deps);
    if (!aside) return;
    const held = chain ? heldEvents.some((e) => e.chain?.signature === chain.signature) : false;
    for (const s of streamers) {
      const line = [...db().events].reverse().find((e) => e.handle === s.handle && e.type === "pledged" && e.challengeId === challenge.id);
      emitTo(s.handle!, "comment", challenge.id, aside.text, {
        ...(aside.source === "grok" ? { by: "grok" as const } : {}),
        ...(line && !held ? { about: line.seq } : {}),
        ...(held && chain ? { chain, hold: true } : {}),
      });
    }
    save();
  } catch {
    // An aside is a nice extra; never let it break a pledge.
  }
}

/** Shortens a wallet address for a name: "7xKX…3fAq". */
export function walletName(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * A pledge someone signed with their own wallet, from a Solana Action
 * (Blink) on X or anywhere else. It is already in escrow on chain; this
 * books it once, under a planter account tied to that wallet, whether the
 * wallet's confirmation call or the QuickNode Stream reports it first.
 */
export function recordWalletPledge(input: { challengeAccount: string; wallet: string; amountMicro: number; signature: string; confirmedAt: number; streamAt?: number }): Pledge | undefined {
  if (db().pledges.some((p) => p.tx === input.signature)) return undefined;
  const challenge = db().challenges.find((c) => c.ledgerRef && chainAccountOf(c.ledgerRef) === input.challengeAccount);
  if (!challenge) return undefined;
  let fan = db().users.find((u) => u.wallet === input.wallet);
  if (!fan) {
    fan = { id: newId("u"), name: walletName(input.wallet), role: "fan", wallet: input.wallet, createdAt: Date.now(), onboarded: false };
    db().users.push(fan);
  }
  if (fan.role !== "fan") return undefined;
  // From the Stream the pledge is shown as it arrives; from the wallet's call it waits briefly for the Stream.
  const record = applyPledge(challenge, fan, input.amountMicro, input.signature, { confirmedAt: input.confirmedAt, streamAt: input.streamAt, hold: !input.streamAt && streamsCarryPledges() });
  save();
  return record;
}

/** Announcer lines by growth stage. The first pledge is its own news, so the sprout has none. */
const MILESTONE_LINES: Record<number, ((c: Challenge) => string) | undefined> = {
  2: () => "The vine is climbing. A third of the way to the clouds.",
  3: () => "That is a proper beanstalk now. Two thirds of the way up.",
  4: (c) => `The beanstalk has reached the clouds! ${formatUsd(c.totalMicro)} is in the pot.`,
};

/** An open pot has no goal, so its lines celebrate the amount instead. */
const OPEN_POT_LINES: Record<number, ((c: Challenge) => string) | undefined> = {
  2: (c) => `The open pot passed ${formatUsd(c.totalMicro)} and keeps growing.`,
  3: (c) => `The open pot is at ${formatUsd(c.totalMicro)}. The beanstalk is getting tall.`,
  4: (c) => `The open pot is past ${formatUsd(c.totalMicro)}. It's in the clouds, and there's no ceiling.`,
};

const RECAP_WINDOW_MS = 12 * 60 * 60_000;

/** The on-chain account in a ledger ref ("<account>:<streamer wallet>"); a simulated ref is kept whole. */
export function chainAccountOf(ref: string): string {
  return ref.startsWith("sim:") ? ref : ref.split(":")[0]!;
}

/** A spoken summary of the stream so far: the last 12 hours of this streamer's challenges. */
export function recapText(streamer: User, now = Date.now()): string {
  const recent = stageChallenges(streamer.id).filter((c) => now - c.createdAt <= RECAP_WINDOW_MS);
  if (recent.length === 0) return "No challenges yet this stream.";
  const paid = recent.filter((c) => c.status === "paid");
  const earned = recent.reduce((sum, c) => sum + earnedBy(c, streamer.id), 0);
  const ids = new Set(recent.map((c) => c.id));
  const byFan = new Map<string, number>();
  let refunded = 0;
  for (const p of db().pledges) {
    if (!ids.has(p.challengeId)) continue;
    refunded += returnedOf(p);
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

/** The stream's facts, for Grok to write the recap from: results, money, and what the escrow program recorded on chain. */
export function recapFacts(streamer: User, now = Date.now()): RecapFacts {
  const recent = stageChallenges(streamer.id).filter((c) => now - c.createdAt <= RECAP_WINDOW_MS);
  const ids = new Set(recent.map((c) => c.id));
  const accounts = new Set(recent.flatMap((c) => (c.ledgerRef ? [chainAccountOf(c.ledgerRef)] : [])));
  const byFan = new Map<string, number>();
  let refunded = 0;
  for (const p of db().pledges) {
    if (!ids.has(p.challengeId)) continue;
    refunded += returnedOf(p);
    byFan.set(p.userId, (byFan.get(p.userId) ?? 0) + p.amountMicro);
  }
  const top = [...byFan.entries()].sort((a, b) => b[1] - a[1])[0];
  const onChain = { pledges: 0, payouts: 0, refunds: 0 };
  for (const e of db().chain) {
    if (!accounts.has(e.challenge)) continue;
    if (e.name === "Pledged") onChain.pledges += 1;
    if (e.name === "Settled" && e.fields.success) onChain.payouts += 1;
    if (e.name === "Refunded") onChain.refunds += 1;
  }
  const settings = settingsOf(streamer);
  const raised = settings.causeOn ? raisedFor(streamer, settings.causeName).raisedMicro : 0;
  return {
    streamer: streamer.name,
    challenges: recent.slice(0, 12).map((c) => ({
      title: c.title,
      result: c.status === "paid" ? "completed" : c.status === "failed" ? "missed" : c.status === "open" || c.status === "locked" ? "live" : "refunded",
      pot: formatUsd(c.totalMicro),
    })),
    earned: formatUsd(recent.reduce((sum, c) => sum + earnedBy(c, streamer.id), 0)),
    ...(refunded > 0 ? { refunded: formatUsd(refunded) } : {}),
    ...(top ? { topBacker: { name: getUser(top[0])?.name ?? "a fan", amount: formatUsd(top[1]) } } : {}),
    ...(raised > 0 ? { cause: { name: settings.causeName, raised: formatUsd(raised) } } : {}),
    onChain,
  };
}

/** Sends the recap to the overlay, where the announcer reads it. Grok drafts it when a key is set. */
export async function announceRecap(actor: User, deps: CoordinatorDeps = coordinatorDeps()): Promise<string> {
  if (actor.role !== "streamer" || !actor.handle) fail("Only a streamer can read the recap");
  const { text, source } = await draftRecap(recapFacts(actor), recapText(actor), deps);
  emitTo(actor.handle, "recap", "", text, source === "grok" ? { by: "grok" } : {});
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
  const upfront = upfrontOf(challenge.totalMicro, challenge.upfrontPct ?? 0);
  challenge.txs.lock = await ledger().lock(challenge, upfront > 0 ? payoutsOf(challenge, upfront) : []);
  challenge.baseline = baseline;
  challenge.status = "locked";
  challenge.lockedAt = Date.now();
  if (upfront > 0) challenge.upfrontPaidMicro = upfront;
  const requested = await payRequest(challenge);
  const forStarting = upfront + requested;
  emit(
    "locked",
    challenge,
    forStarting > 0
      ? `Pledging is closed. ${namesOf(challenge)} got ${formatUsd(forStarting)} for taking it on; the other ${formatUsd(challenge.totalMicro - upfront)} pays out only if they finish.`
      : `Pledging is closed. ${formatUsd(challenge.totalMicro)} is riding on this one.`,
  );
  save();
  return challenge;
}

/**
 * Returns each fan's money, one refund per fan as the escrow program does.
 * If part of the pot was paid up front, each fan keeps that share of their
 * pledge with the streamer.
 */
async function refundAll(challenge: Challenge): Promise<number> {
  await returnRequest(challenge);
  const byFan = new Map<string, Pledge[]>();
  for (const p of db().pledges) {
    if (p.challengeId !== challenge.id || p.refunded) continue;
    byFan.set(p.userId, [...(byFan.get(p.userId) ?? []), p]);
  }
  let count = 0;
  for (const [userId, pledges] of byFan) {
    const fan = getUser(userId);
    if (!fan) continue;
    const pledged = pledges.reduce((sum, p) => sum + p.amountMicro, 0);
    let kept = challenge.upfrontPaidMicro ? keptOnRefund(pledged, challenge.upfrontPct ?? 0) : 0;
    const back = pledged - kept;
    const tx = back > 0 ? await ledger().refund(challenge, fan.wallet, back) : "nothing-to-return";
    // Record the kept part against the fan's pledges in order, so totals add up.
    for (const p of pledges) {
      const keptHere = Math.min(kept, p.amountMicro);
      kept -= keptHere;
      p.refundMicro = p.amountMicro - keptHere;
      p.refundTx = tx;
      p.refunded = true;
      count += 1;
    }
  }
  return count;
}

/** What a pledge actually returned. */
export const returnedOf = (p: Pledge): number => (p.refunded ? (p.refundMicro ?? p.amountMicro) : 0);

/**
 * What a streamer has taken from a challenge: their share of anything paid
 * up front, plus their share of the rest if it was completed.
 */
export function earnedBy(challenge: Challenge, userId: string): number {
  const upfront = challenge.upfrontPaidMicro ?? 0;
  const fromUpfront = upfront > 0 ? shareOf(challenge, userId, upfront) : 0;
  const fromRequest = userId === challenge.streamerId ? (challenge.requestPaidMicro ?? 0) : 0;
  return fromRequest + fromUpfront + (challenge.status === "paid" ? shareOf(challenge, userId, challenge.totalMicro - upfront) : 0);
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
    upfrontPct: previous.upfrontPct ?? 0,
    open: isOpenPot(previous),
  });
}

/** The wallet for each of a challenge's splits, in order. */
function shareWalletsOf(challenge: Challenge): string[] {
  return (challenge.splits ?? []).map((split) => (split.kind === "guest" ? getUser(split.userId ?? "")?.wallet : (split.wallet ?? causeWallet(split.name))) ?? fail(`No wallet on file for ${split.name}`));
}

/** Who receives what from a payout: by default the part of the pot not already paid up front. */
function payoutsOf(challenge: Challenge, amountMicro = challenge.totalMicro - (challenge.upfrontPaidMicro ?? 0)): { wallet: string; amountMicro: number }[] {
  const host = getUser(challenge.streamerId) ?? fail("Streamer not found");
  const { hostMicro, parts } = splitPot(amountMicro, challenge.splits);
  const payouts = [{ wallet: host.wallet, amountMicro: hostMicro }];
  (challenge.splits ?? []).forEach((split, index) => {
    const wallet = split.kind === "guest" ? getUser(split.userId ?? "")?.wallet : (split.wallet ?? causeWallet(split.name));
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
/** Checks in progress, by challenge: a second caller waits for the first instead of settling twice. */
const checking = new Map<string, Promise<Challenge>>();

/**
 * Settles a challenge when its result is in, or refunds it once its time
 * has run out. The background job, page loads and "Check now" all call
 * this; calls for the same challenge run one at a time, so a result can
 * never be applied twice.
 */
export async function check(challengeId: string, opts: { force?: boolean; deps?: Deps } = {}): Promise<Challenge> {
  const running = checking.get(challengeId);
  if (running) {
    await running.catch(() => undefined);
    return getChallenge(challengeId);
  }
  const run = checkOnce(challengeId, opts).finally(() => checking.delete(challengeId));
  checking.set(challengeId, run);
  return run;
}

async function checkOnce(challengeId: string, opts: { force?: boolean; deps?: Deps }): Promise<Challenge> {
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
  await expireBounties();
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
  current.ruledBy = actor.id;
  current.ruledAt = Date.now();
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

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

/**
 * A wallet for a new account that signed in for real: made by Privy when
 * Privy is set up on the Solana ledger, otherwise the ledger's own kind.
 */
async function walletFor(userId: string): Promise<string> {
  if (ledger().kind === "solana" && privyConfigured()) return createPrivyWallet();
  return ledger().newWallet(userId);
}

/**
 * Signs someone in with a provider account. The first time, they get a
 * planter account that still has to choose its role.
 */
export async function signInWith(provider: string, profile: import("./oauth").Profile): Promise<User> {
  const email = accountEmail(profile.email);
  const verified = Boolean(email && (provider === "email" || profile.emailVerified === true));
  const findAccount = (): User | undefined => {
    const existing = db().users.find(u =>
      u.identities?.some(i => i.provider === provider && i.subject === profile.subject),
    );
    const matches = email ? accountsWithEmail(email) : [];
    if (existing) {
      // A returning provider identity takes precedence, even for old duplicate accounts.
      if (verified && (!existing.email || accountEmail(existing.email) === email) &&
          matches.every(u => u.id === existing.id)) {
        existing.email = email;
        existing.emailVerified = true;
      }
      importProfile(existing, provider, profile);
      save();
      return existing;
    }
    if (matches.length) {
      const [match] = matches;
      if (!verified || matches.length !== 1 || !match || verifiedAccountEmail(match) !== email ||
          match.identities?.some(i => i.provider === provider) || match.disconnectedProviders?.includes(provider)) {
        throw new EmailLinkRequired();
      }
      (match.identities ??= []).push({ provider, subject: profile.subject });
      match.email = email;
      match.emailVerified = true;
      importProfile(match, provider, profile);
      save();
      return match;
    }
    // Ask first-time Google users with third-party mailboxes to prove access
    // through email sign-in and then connect Google from Settings.
    if (provider === "google" && email && !verified) throw new EmailLinkRequired();
  };

  const existing = findAccount();
  if (existing) return existing;
  const id = newId("u");
  const wallet = await walletFor(id);
  // Wallet creation can await a remote call. Recheck before recording a new account.
  const concurrent = findAccount();
  if (concurrent) return concurrent;
  const name = profile.name.trim().slice(0, 24) || "Planter";
  const user: User = {
    id,
    name,
    role: "fan",
    wallet,
    createdAt: Date.now(),
    identities: [{ provider, subject: profile.subject }],
    ...(verified ? { email, emailVerified: true } : {}),
    onboarded: false,
  };
  importProfile(user, provider, profile);
  db().users.push(user);
  await ledger().faucet(user.wallet, FAUCET_MICRO);
  save();
  return user;
}

const RESERVED_HANDLES = new Set(["ryan", "kai", "admin", "potted", "api", "login", "welcome", "dashboard", "garden", "activity", "about"]);

/** A new account picks what it is here to do. Climbers also claim their stream's address. */
/** Checks a stream address and returns it cleaned, or throws. */
function claimableHandle(handle: string): string {
  const clean = handle.trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9_]{3,20}$/.test(clean)) fail("Pick a stream address of 3 to 20 letters, numbers or underscores");
  if (RESERVED_HANDLES.has(clean) || db().users.some((u) => u.handle === clean)) fail("That stream address is taken");
  return clean;
}

export async function chooseRole(actor: User, role: "fan" | "streamer" | "mod", handle = "", keeperCode = ""): Promise<User> {
  if (actor.onboarded !== false) fail("This account has already chosen");
  if (role === "mod") {
    if (!keeperCodeConfigured()) fail("Keeper sign-up is invite only and not open on this server");
    if (!keeperCodeOk(keeperCode)) fail("That keeper invite code is not right");
    actor.role = "mod";
  }
  if (role === "streamer") {
    actor.handle = claimableHandle(handle);
    actor.role = "streamer";
    if (actor.profile?.twitch?.login) actor.settings = { ...actor.settings, twitchChannel: actor.profile.twitch.login };
  }
  actor.onboarded = true;
  save();
  return actor;
}

// ---------------------------------------------------------------------------
// Planter stats
// ---------------------------------------------------------------------------

/** Levels are earned by taking part, not by the size of a pledge. */
export const LEVELS = [
  { name: "Seed", at: 0 },
  { name: "Sprout", at: 30 },
  { name: "Vine tender", at: 90 },
  { name: "Green thumb", at: 200 },
  { name: "Beanstalk keeper", at: 400 },
  { name: "Cloud walker", at: 800 },
] as const;

/** Every garden badge, in the order the garden shows them. */
const BADGE_LIST = [
  { id: "first-bean", name: "First bean", how: "Back your first challenge" },
  { id: "early-bird", name: "Early bird", how: "Be the first to back a challenge" },
  { id: "cloud-pusher", name: "Cloud pusher", how: "Make the pledge that takes a pot to its goal" },
  { id: "good-harvest", name: "Good harvest", how: "Back 3 challenges that were completed" },
  { id: "wide-garden", name: "Wide garden", how: "Back challenges in 3 different games" },
  { id: "good-cause", name: "Good cause", how: "Back a charity stream challenge" },
  { id: "matchmaker", name: "Matchmaker", how: "Back a collab between two climbers" },
  { id: "regular", name: "Regular", how: "Pledge three days in a row" },
  { id: "money-back", name: "Money back", how: "Get a pledge refunded after a missed challenge" },
  { id: "idea-planter", name: "Idea planter", how: "Have a climber open a challenge you suggested" },
  { id: "talent-scout", name: "Talent scout", how: "Back 3 different climbers" },
  { id: "hat-trick", name: "Hat-trick", how: "Be the first to back 3 challenges" },
  { id: "skyline", name: "Skyline", how: "Take 3 pots to their goal" },
  { id: "seasoned", name: "Seasoned", how: "Back 10 challenges" },
  { id: "bumper-crop", name: "Bumper crop", how: "Back 10 challenges that were completed" },
  { id: "evergreen", name: "Evergreen", how: "Pledge seven days in a row" },
] as const;

const XP = { backed: 10, grown: 15, firstIn: 5, cloudPush: 10 } as const;

export interface Badge {
  id: string;
  name: string;
  how: string;
  earned: boolean;
}

export interface PlanterStats {
  xp: number;
  level: { index: number; name: string; floor: number; next?: { name: string; at: number } };
  /** Days in a row with at least one pledge, counting today or yesterday as the latest. */
  streakDays: number;
  backed: number;
  grown: number;
  firstIn: number;
  cloudPushes: number;
  streamersBacked: number;
  badges: Badge[];
}

const DAY_MS = 24 * 60 * 60_000;

export function planterStats(fan: User, now = Date.now()): PlanterStats {
  const mine = db().pledges.filter((p) => p.userId === fan.id);
  const challengeIds = [...new Set(mine.map((p) => p.challengeId))];
  const challenges = challengeIds.flatMap((id) => db().challenges.find((c) => c.id === id) ?? []);
  const grown = challenges.filter((c) => c.status === "paid").length;

  let firstIn = 0;
  let cloudPushes = 0;
  let causes = 0;
  let collabs = 0;
  for (const c of challenges) {
    const all = db().pledges.filter((p) => p.challengeId === c.id).sort((a, b) => a.createdAt - b.createdAt);
    if (all[0]?.userId === fan.id) firstIn++;
    // The pledge that carried the pot past its goal.
    let running = 0;
    for (const p of all) {
      const before = running;
      running += p.amountMicro;
      if (before < c.goalMicro && running >= c.goalMicro) {
        if (p.userId === fan.id) cloudPushes++;
        break;
      }
    }
    if (c.splits?.some((s) => s.kind === "cause")) causes++;
    if (c.splits?.some((s) => s.kind === "guest")) collabs++;
  }

  const days = new Set(mine.map((p) => Math.floor(p.createdAt / DAY_MS)));
  const today = Math.floor(now / DAY_MS);
  let streakDays = 0;
  for (let day = days.has(today) ? today : today - 1; days.has(day); day--) streakDays++;

  const streamersBacked = new Set(challenges.map((c) => c.streamerId)).size;
  const games = new Set(challenges.map((c) => c.gameId)).size;
  const xp = challenges.length * XP.backed + grown * XP.grown + firstIn * XP.firstIn + cloudPushes * XP.cloudPush;
  const index = LEVELS.reduce((best, level, i) => (xp >= level.at ? i : best), 0);
  const next = LEVELS[index + 1];

  const earned: Record<string, boolean> = {
    "first-bean": challenges.length >= 1,
    "early-bird": firstIn >= 1,
    "cloud-pusher": cloudPushes >= 1,
    "good-harvest": grown >= 3,
    "wide-garden": games >= 3,
    "good-cause": causes >= 1,
    "matchmaker": collabs >= 1,
    "regular": streakDays >= 3,
    "money-back": mine.some((p) => p.refunded),
    "idea-planter": db().suggestions.some((s) => s.userId === fan.id && s.status === "used"),
    "talent-scout": streamersBacked >= 3,
    "hat-trick": firstIn >= 3,
    "skyline": cloudPushes >= 3,
    "seasoned": challenges.length >= 10,
    "bumper-crop": grown >= 10,
    "evergreen": streakDays >= 7,
  };
  const badges: Badge[] = BADGE_LIST.map((b) => ({ ...b, earned: Boolean(earned[b.id]) }));

  return {
    xp,
    level: { index, name: LEVELS[index]!.name, floor: LEVELS[index]!.at, ...(next ? { next: { name: next.name, at: next.at } } : {}) },
    streakDays,
    backed: challenges.length,
    grown,
    firstIn,
    cloudPushes,
    streamersBacked,
    badges,
  };
}

/** The biggest backers of a streamer's stage, by money that stayed in (refunds do not count). */
export function topPlanters(streamerId: string, limit = 5): { userId: string; name: string; amountMicro: number; challenges: number }[] {
  const ids = new Set(stageChallenges(streamerId).map((c) => c.id));
  const rows = new Map<string, { amountMicro: number; challenges: Set<string> }>();
  for (const p of db().pledges) {
    if (!ids.has(p.challengeId) || p.refunded) continue;
    const row = rows.get(p.userId) ?? { amountMicro: 0, challenges: new Set<string>() };
    row.amountMicro += p.amountMicro;
    row.challenges.add(p.challengeId);
    rows.set(p.userId, row);
  }
  return [...rows.entries()]
    .map(([userId, row]) => ({ userId, name: getUser(userId)?.name ?? "A planter", amountMicro: row.amountMicro, challenges: row.challenges.size }))
    .sort((a, b) => b.amountMicro - a.amountMicro)
    .slice(0, limit);
}

/** Open and in-progress challenges across every stream, fullest pots first. */
export function liveEverywhere(limit = 6): Challenge[] {
  return db()
    .challenges.filter((c) => c.status === "open" || c.status === "locked")
    .sort((a, b) => growthOf(b.totalMicro, b.goalMicro).ratio - growthOf(a.totalMicro, a.goalMicro).ratio || b.createdAt - a.createdAt)
    .slice(0, limit);
}

/** Disputed clips that still need a keeper's ruling. */
export function disputesWaiting(): Challenge[] {
  return db().challenges.filter((c) => c.status === "locked" && (c.claim?.disputedBy.length ?? 0) > 0 && !c.claim?.ruling);
}

// ---------------------------------------------------------------------------
// Browsing and search
// ---------------------------------------------------------------------------

/** One streamer's presence in a directory: what they have live and how much is riding on it. */
export interface StreamListing {
  streamer: User;
  /** The fullest live challenge, used as the card's headline. */
  headline: Challenge;
  liveCount: number;
  potMicro: number;
  planters: number;
  charity: boolean;
  collab: boolean;
  /** The stream they said they started, if any. */
  session?: LiveSession;
}

const isLive = (c: Challenge) => c.status === "open" || c.status === "locked";

/** A game's display name from its id. */
export function gameOfId(gameId: string): string {
  return GAMES.find((g) => g.id === gameId)?.name ?? "these";
}

/** Streamers with something live, biggest pots first. Pass a game id to narrow it to one game. */
export function liveStreams(gameId?: string): StreamListing[] {
  const byStreamer = new Map<string, Challenge[]>();
  for (const c of db().challenges) {
    if (!isLive(c) || (gameId && c.gameId !== gameId)) continue;
    byStreamer.set(c.streamerId, [...(byStreamer.get(c.streamerId) ?? []), c]);
  }
  const listings: StreamListing[] = [];
  for (const [streamerId, challenges] of byStreamer) {
    const streamer = getUser(streamerId);
    if (!streamer?.handle) continue;
    const ids = new Set(challenges.map((c) => c.id));
    listings.push({
      streamer,
      headline: [...challenges].sort((a, b) => b.totalMicro - a.totalMicro || b.createdAt - a.createdAt)[0]!,
      liveCount: challenges.length,
      potMicro: challenges.reduce((sum, c) => sum + c.totalMicro, 0),
      planters: new Set(db().pledges.filter((p) => ids.has(p.challengeId)).map((p) => p.userId)).size,
      charity: challenges.some((c) => c.splits?.some((s) => s.kind === "cause")),
      collab: challenges.some((c) => c.splits?.some((s) => s.kind === "guest")),
      ...(liveSessionOf(streamer) ? { session: liveSessionOf(streamer) } : {}),
    });
  }
  return listings.sort((a, b) => b.potMicro - a.potMicro || b.planters - a.planters);
}

/** Finished challenges, newest first, optionally for one game. */
export function recentResults(gameId?: string, limit = 8): Challenge[] {
  return db()
    .challenges.filter((c) => !isLive(c) && (!gameId || c.gameId === gameId))
    .sort((a, b) => (b.settledAt ?? b.createdAt) - (a.settledAt ?? a.createdAt))
    .slice(0, limit);
}

export type SettledSort = "recent" | "pot" | "popular" | "completed";

/** Settled challenges in a game, sorted: newest, biggest pot, most planters, or completed first. */
export function settledIn(gameId: string, sort: SettledSort = "recent", limit = 24): Challenge[] {
  const recency = (c: Challenge) => c.settledAt ?? c.createdAt;
  const planters = new Map<string, number>();
  const list = db().challenges.filter((c) => !isLive(c) && c.gameId === gameId);
  for (const c of list) planters.set(c.id, fundersOf(c.id).length);
  const by: Record<SettledSort, (a: Challenge, b: Challenge) => number> = {
    recent: (a, b) => recency(b) - recency(a),
    pot: (a, b) => b.totalMicro - a.totalMicro || recency(b) - recency(a),
    popular: (a, b) => planters.get(b.id)! - planters.get(a.id)! || b.totalMicro - a.totalMicro,
    completed: (a, b) => Number(b.status === "paid") - Number(a.status === "paid") || recency(b) - recency(a),
  };
  return list.sort(by[sort]).slice(0, limit);
}

/** How many streamers are live in each game. */
export function liveCountsByGame(): Record<string, number> {
  const counts: Record<string, Set<string>> = {};
  for (const c of db().challenges) if (isLive(c)) (counts[c.gameId] ??= new Set()).add(c.streamerId);
  return Object.fromEntries(Object.entries(counts).map(([id, set]) => [id, set.size]));
}

export interface SearchResults {
  games: (typeof GAMES)[number][];
  /** Streamers who have set up at least one challenge. */
  streamers: { streamer: User; challenges: number; live: number }[];
  challenges: Challenge[];
}

/** Finds games, streamers who have run challenges, and the challenges themselves. */
export function search(query: string, limit = 12): SearchResults {
  const q = query.trim().toLowerCase().replace(/^@/, "");
  if (q.length < 2) return { games: [], streamers: [], challenges: [] };
  const games = GAMES.filter((g) => g.name.toLowerCase().includes(q) || g.id.includes(q));
  const gameIds = new Set(games.map((g) => g.id));
  const streamers = listStreamers()
    .map((streamer) => {
      const own = db().challenges.filter((c) => c.streamerId === streamer.id);
      return { streamer, challenges: own.length, live: own.filter(isLive).length };
    })
    .filter((row) => row.challenges > 0 && (row.streamer.name.toLowerCase().includes(q) || row.streamer.handle!.includes(q)))
    .sort((a, b) => b.live - a.live || b.challenges - a.challenges);
  const challenges = db()
    .challenges.filter((c) => c.title.toLowerCase().includes(q) || gameIds.has(c.gameId))
    .sort((a, b) => Number(isLive(b)) - Number(isLive(a)) || b.createdAt - a.createdAt)
    .slice(0, limit);
  return { games, streamers: streamers.slice(0, limit), challenges };
}

/** Numbers for a challenge's tile on the climber's dashboard. */
export function challengeStats(challenge: Challenge, viewerId: string) {
  const funders = fundersOf(challenge.id);
  const end = challenge.settledAt ?? Date.now();
  return {
    planters: funders.length,
    /** Null for an open pot, which has no goal. */
    pctOfGoal: isOpenPot(challenge) ? null : Math.round((challenge.totalMicro / challenge.goalMicro) * 100),
    biggestMicro: funders[0]?.amountMicro ?? 0,
    /** What this streamer took home, or would at the current pot. */
    shareMicro: earnedBy(challenge, viewerId),
    minutes: Math.max(1, Math.round((end - challenge.createdAt) / 60_000)),
  };
}

// ---------------------------------------------------------------------------
// Climber and keeper analytics
// ---------------------------------------------------------------------------

export interface ClimberStats {
  total: number;
  live: number;
  completed: number;
  missed: number;
  /** Completed as a share of settled challenges, 0 to 100. */
  completionPct: number;
  earnedMicro: number;
  refundedMicro: number;
  raisedMicro: number;
  planters: number;
  /** Planters who backed more than one of this climber's challenges. */
  returning: number;
  averagePotMicro: number;
  byGame: { gameId: string; name: string; challenges: number; completed: number; earnedMicro: number }[];
  /** Settled challenges, oldest first, for the pot chart. */
  history: { id: string; title: string; potMicro: number; paid: boolean }[];
}

export function climberStats(streamer: User): ClimberStats {
  const all = stageChallenges(streamer.id);
  const settled = all.filter((c) => !isLive(c));
  const paid = settled.filter((c) => c.status === "paid");
  const ids = new Set(all.map((c) => c.id));
  const perPlanter = new Map<string, Set<string>>();
  let refundedMicro = 0;
  for (const p of db().pledges) {
    if (!ids.has(p.challengeId)) continue;
    refundedMicro += returnedOf(p);
    perPlanter.set(p.userId, (perPlanter.get(p.userId) ?? new Set()).add(p.challengeId));
  }
  let raisedMicro = 0;
  for (const c of paid) {
    const { parts } = splitPot(c.totalMicro, c.splits);
    (c.splits ?? []).forEach((s, i) => {
      if (s.kind === "cause") raisedMicro += parts[i]!;
    });
  }
  const games = new Map<string, { challenges: number; completed: number; earnedMicro: number }>();
  for (const c of all) {
    const row = games.get(c.gameId) ?? { challenges: 0, completed: 0, earnedMicro: 0 };
    row.challenges++;
    if (c.status === "paid") row.completed++;
    row.earnedMicro += earnedBy(c, streamer.id);
    games.set(c.gameId, row);
  }
  const funded = all.filter((c) => c.totalMicro > 0);
  return {
    total: all.length,
    live: all.length - settled.length,
    completed: paid.length,
    missed: settled.length - paid.length,
    completionPct: settled.length === 0 ? 0 : Math.round((paid.length / settled.length) * 100),
    earnedMicro: all.reduce((sum, c) => sum + earnedBy(c, streamer.id), 0),
    refundedMicro,
    raisedMicro,
    planters: perPlanter.size,
    returning: [...perPlanter.values()].filter((set) => set.size > 1).length,
    averagePotMicro: funded.length === 0 ? 0 : Math.round(funded.reduce((sum, c) => sum + c.totalMicro, 0) / funded.length),
    byGame: [...games.entries()]
      .map(([gameId, row]) => ({ gameId, name: GAMES.find((g) => g.id === gameId)?.name ?? gameId, ...row }))
      .sort((a, b) => b.earnedMicro - a.earnedMicro || b.challenges - a.challenges),
    history: [...settled]
      // Two challenges can settle in the same millisecond; the order they were created in breaks the tie.
      .sort((a, b) => (a.settledAt ?? a.createdAt) - (b.settledAt ?? b.createdAt) || db().challenges.indexOf(a) - db().challenges.indexOf(b))
      .slice(-12)
      .map((c) => ({ id: c.id, title: c.title, potMicro: c.totalMicro, paid: c.status === "paid" })),
  };
}

/** What a keeper has ruled on, newest first, and the money those rulings decided. */
export function keeperStats(keeper: User) {
  const ruled = db()
    .challenges.filter((c) => c.claim?.ruledBy === keeper.id)
    .sort((a, b) => (b.claim?.ruledAt ?? 0) - (a.claim?.ruledAt ?? 0));
  const upheld = ruled.filter((c) => c.claim?.ruling === "upheld");
  return {
    waiting: disputesWaiting(),
    ruled,
    upheld: upheld.length,
    rejected: ruled.length - upheld.length,
    paidOutMicro: upheld.reduce((sum, c) => sum + c.totalMicro, 0),
    refundedMicro: ruled.filter((c) => c.claim?.ruling === "rejected").reduce((sum, c) => sum + c.totalMicro, 0),
  };
}

/** A planter's own recent money movements, newest first. */
export function planterActivity(fan: User, limit = 12): { at: number; challenge: Challenge; text: string; kind: "pledged" | "refunded" | "paid" }[] {
  const rows: { at: number; challenge: Challenge; text: string; kind: "pledged" | "refunded" | "paid" }[] = [];
  const seenOutcome = new Set<string>();
  for (const p of db().pledges) {
    if (p.userId !== fan.id) continue;
    const challenge = db().challenges.find((c) => c.id === p.challengeId);
    if (!challenge) continue;
    rows.push({ at: p.createdAt, challenge, kind: "pledged", text: `You pledged ${formatUsd(p.amountMicro)}` });
    if (challenge.settledAt && !seenOutcome.has(challenge.id)) {
      seenOutcome.add(challenge.id);
      rows.push(
        challenge.status === "paid"
          ? { at: challenge.settledAt, challenge, kind: "paid", text: "Completed: your pledge went to the climber" }
          : {
              at: challenge.settledAt,
              challenge,
              kind: "refunded",
              text: challenge.upfrontPaidMicro ? "Missed: the part not paid up front came back" : "Missed: your pledge came back",
            },
      );
    }
  }
  // Newest first. An outcome can share a millisecond with the last pledge; it still comes after it.
  const order = (kind: string) => (kind === "pledged" ? 1 : 0);
  return rows.sort((a, b) => b.at - a.at || order(a.kind) - order(b.kind)).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Bounties
// ---------------------------------------------------------------------------

/** Most one planter can hold on a single bounty. */
const MAX_BACKING_MICRO = toMicro(500);
const MAX_OPEN_BOUNTIES_PER_FAN = 3;

/** The shared checks for a fan's idea: length, game, blocked words. */
function cleanIdea(streamer: User, gameId: string, text: string, customGame: string) {
  const game = GAMES.find((g) => g.id === gameId) ?? fail("Unknown game");
  if (!takesGame(settingsOf(streamer), game.id)) fail(`${streamer.name} is not taking ${game.name} challenges`);
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length < 8 || clean.length > 140) fail("Describe the challenge in 8 to 140 characters");
  const named = game.id === "other" ? customGame.trim().replace(/\s+/g, " ") : "";
  if (named.length > 40) fail("Keep the game's name under 40 characters");
  const lower = `${clean} ${named}`.toLowerCase();
  if (settingsOf(streamer).blockedWords.some((word) => lower.includes(word))) fail("That idea uses a word this streamer has blocked");
  return { game, clean, named };
}

export function bountyTotal(bountyId: string): number {
  return db()
    .backings.filter((b) => b.bountyId === bountyId)
    .reduce((sum, b) => sum + b.amountMicro, 0);
}

/** Who put money on a bounty, biggest first, one row per planter. */
export function backersOf(bountyId: string): { userId: string; name: string; amountMicro: number }[] {
  const rows = new Map<string, number>();
  for (const b of db().backings) if (b.bountyId === bountyId) rows.set(b.userId, (rows.get(b.userId) ?? 0) + b.amountMicro);
  return [...rows.entries()]
    .map(([userId, amountMicro]) => ({ userId, name: getUser(userId)?.name ?? "A planter", amountMicro }))
    .sort((a, b) => b.amountMicro - a.amountMicro);
}

export function getBounty(id: string): Bounty {
  return db().bounties.find((b) => b.id === id) ?? fail("Bounty not found");
}

/** Open bounties on a streamer, biggest first. Closes expired ones first. */
export function openBounties(streamerId: string, now = Date.now()): Bounty[] {
  return db()
    .bounties.filter((b) => b.streamerId === streamerId && b.status === "open" && b.expiresAt > now)
    .sort((a, b) => bountyTotal(b.id) - bountyTotal(a.id) || a.createdAt - b.createdAt);
}

async function back(actor: User, bounty: Bounty, amountUsd: number): Promise<Backing> {
  const amountMicro = toMicro(amountUsd);
  const streamer = getUser(bounty.streamerId) ?? fail("Streamer not found");
  const minMicro = toMicro(settingsOf(streamer).minPledgeUsd);
  if (!(amountMicro >= minMicro)) fail(`The smallest amount on this stream is ${formatUsd(minMicro)}`);
  const already = db()
    .backings.filter((b) => b.bountyId === bounty.id && b.userId === actor.id)
    .reduce((sum, b) => sum + b.amountMicro, 0);
  if (already + amountMicro > MAX_BACKING_MICRO) fail(`One planter can put up to ${formatUsd(MAX_BACKING_MICRO)} on a bounty`);
  const tx = await ledger().holdBacking(bounty.id, actor.wallet, amountMicro);
  const backing: Backing = { id: newId("k"), bountyId: bounty.id, userId: actor.id, amountMicro, createdAt: Date.now(), tx };
  db().backings.push(backing);
  return backing;
}

/** A planter puts money on an idea. Nothing reaches the streamer unless they accept it. */
export async function postBounty(
  actor: User,
  input: { handle: string; gameId: string; text: string; customGame?: string; amountUsd: number; hours: number },
): Promise<Bounty> {
  if (actor.role !== "fan") fail("Sign in as a planter to post a bounty");
  const streamer = getStreamer(input.handle) ?? fail("Streamer not found");
  if (!settingsOf(streamer).acceptingBounties) fail(`${streamer.name} is not taking bounties right now`);
  const hours = Number(input.hours);
  if (!Number.isInteger(hours) || hours < 1 || hours > 72) fail("A bounty can stay open for 1 to 72 hours");
  const { game, clean, named } = cleanIdea(streamer, input.gameId, input.text, input.customGame ?? "");
  const mine = db().bounties.filter((b) => b.creatorId === actor.id && b.status === "open" && b.expiresAt > Date.now());
  if (mine.length >= MAX_OPEN_BOUNTIES_PER_FAN) fail(`You already have ${MAX_OPEN_BOUNTIES_PER_FAN} open bounties`);
  const now = Date.now();
  const bounty: Bounty = {
    id: newId("b"),
    streamerId: streamer.id,
    creatorId: actor.id,
    gameId: game.id,
    ...(named ? { customGame: named } : {}),
    text: clean,
    createdAt: now,
    expiresAt: now + hours * 60 * 60_000,
    status: "open",
  };
  db().bounties.push(bounty);
  try {
    await back(actor, bounty, input.amountUsd);
  } catch (error) {
    db().bounties.pop();
    throw error;
  }
  emitTo(streamer.handle!, "bounty", "", `${actor.name} put ${formatUsd(bountyTotal(bounty.id))} on a bounty: ${clean}`);
  save();
  return bounty;
}

/** Another planter adds money to an open bounty. */
export async function backBounty(actor: User, bountyId: string, amountUsd: number): Promise<Bounty> {
  if (actor.role !== "fan") fail("Sign in as a planter to back a bounty");
  await expireBounties();
  const bounty = getBounty(bountyId);
  if (bounty.status !== "open") fail("This bounty is closed");
  await back(actor, bounty, amountUsd);
  const streamer = getUser(bounty.streamerId)!;
  emitTo(streamer.handle!, "bounty", "", `${actor.name} added to a bounty. It is now ${formatUsd(bountyTotal(bounty.id))}: ${bounty.text}`);
  save();
  return bounty;
}

async function returnAll(bounty: Bounty, status: "declined" | "expired"): Promise<void> {
  const streamer = getUser(bounty.streamerId);
  const back = new Map<string, number>();
  for (const b of db().backings) {
    if (b.bountyId !== bounty.id || b.outcome) continue;
    const owner = getUser(b.userId);
    if (!owner) continue;
    await ledger().returnBacking(bounty.id, owner.wallet, b.amountMicro);
    b.outcome = "returned";
    back.set(owner.id, (back.get(owner.id) ?? 0) + b.amountMicro);
  }
  // Each fan has their money back, and the choice to send it on as a tip anyway.
  for (const [fanId, amount] of back) {
    notifications.notify(
      fanId,
      "refund",
      status === "declined" ? `${streamer?.name ?? "The climber"} passed on your request` : "Your request expired",
      `Your ${formatUsd(amount)} is back in your wallet. Want to send it as a tip instead?`,
      streamer?.handle ? `/s/${streamer.handle}#give` : "/garden",
    );
  }
  bounty.status = status;
  bounty.closedAt = Date.now();
}

/** The streamer passes. Every backer gets their money back. */
export async function declineBounty(actor: User, bountyId: string): Promise<Bounty> {
  const bounty = getBounty(bountyId);
  if (bounty.streamerId !== actor.id) fail("Only the streamer this bounty is for can decline it");
  if (bounty.status !== "open") fail("This bounty is closed");
  await returnAll(bounty, "declined");
  save();
  return bounty;
}

/** Returns the money on every bounty whose time ran out. Safe to call often. */
export async function expireBounties(now = Date.now()): Promise<number> {
  let closed = 0;
  for (const bounty of db().bounties) {
    if (bounty.status !== "open" || bounty.expiresAt > now) continue;
    await returnAll(bounty, "expired");
    closed++;
  }
  if (closed > 0) save();
  return closed;
}

/**
 * The streamer takes the request on. They set the exact terms, as for any
 * challenge. The request money stays held and goes to them when they start
 * the attempt, whatever the result; it comes back to the planters if they
 * never start. Pledges added after this are ordinary completion pledges.
 */
export async function acceptBounty(actor: User, bountyId: string, input: NewChallenge): Promise<Challenge> {
  await expireBounties();
  const bounty = getBounty(bountyId);
  if (bounty.streamerId !== actor.id) fail("Only the streamer this bounty is for can accept it");
  if (bounty.status !== "open") fail("This bounty is closed");
  const challenge = await createChallenge(actor, input);
  const backings = db().backings.filter((b) => b.bountyId === bounty.id && !b.outcome);
  for (const b of backings) b.outcome = "held";
  challenge.bountyId = bounty.id;
  challenge.requestMicro = backings.reduce((sum, b) => sum + b.amountMicro, 0);
  bounty.status = "accepted";
  bounty.challengeId = challenge.id;
  bounty.closedAt = Date.now();
  emit(
    "pledged",
    challenge,
    `${actor.name} took the request on. ${formatUsd(challenge.requestMicro)} from ${backersOf(bounty.id).length} ${backersOf(bounty.id).length === 1 ? "fan" : "fans"} pays when the attempt starts; pledges from here pay only if it's completed.`,
  );
  save();
  return challenge;
}

/** A planter's bounties and what happened to their money on each, newest first. */
export function bountiesBackedBy(fan: User): { bounty: Bounty; mineMicro: number; totalMicro: number; streamerName: string }[] {
  const ids = [...new Set(db().backings.filter((b) => b.userId === fan.id).map((b) => b.bountyId))];
  return ids
    .flatMap((id) => db().bounties.find((b) => b.id === id) ?? [])
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((bounty) => ({
      bounty,
      mineMicro: db()
        .backings.filter((b) => b.bountyId === bounty.id && b.userId === fan.id)
        .reduce((sum, b) => sum + b.amountMicro, 0),
      totalMicro: bountyTotal(bounty.id),
      streamerName: getUser(bounty.streamerId)?.name ?? "A climber",
    }));
}

/** Funded requests work on both ledgers: on Solana the server's token account holds the money until the climber answers. */
export function bountiesSupported(): boolean {
  return true;
}

/** Pays held request money to the climber when the attempt starts. Returns the total paid. */
async function payRequest(challenge: Challenge): Promise<number> {
  if (!challenge.bountyId) return 0;
  const host = getUser(challenge.streamerId);
  if (!host) return 0;
  let paid = 0;
  for (const b of db().backings) {
    if (b.bountyId !== challenge.bountyId || b.outcome !== "held") continue;
    b.payTx = await ledger().payBacking(b.bountyId, host.wallet, b.amountMicro);
    b.outcome = "paid";
    paid += b.amountMicro;
  }
  if (paid > 0) challenge.requestPaidMicro = (challenge.requestPaidMicro ?? 0) + paid;
  return paid;
}

/** Sends held request money back when a taken-on request is never started. */
async function returnRequest(challenge: Challenge): Promise<void> {
  if (!challenge.bountyId) return;
  for (const b of db().backings) {
    if (b.bountyId !== challenge.bountyId || b.outcome !== "held") continue;
    const owner = getUser(b.userId);
    if (!owner) continue;
    b.payTx = await ledger().returnBacking(b.bountyId, owner.wallet, b.amountMicro);
    b.outcome = "returned";
  }
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

/** The campaign a streamer is running now, if any. */
export function activeCampaign(streamerId: string): Campaign | undefined {
  return (db().campaigns ?? []).find((c) => c.streamerId === streamerId && !c.endedAt);
}

export function campaignsOf(streamerId: string): Campaign[] {
  return (db().campaigns ?? []).filter((c) => c.streamerId === streamerId).sort((a, b) => b.startedAt - a.startedAt);
}

/** Starts a campaign. New challenges join it until it is ended. */
export async function startCampaign(actor: User, name: string, goalUsd: number): Promise<Campaign> {
  if (actor.role !== "streamer") fail("Only a climber runs campaigns");
  if (activeCampaign(actor.id)) fail("End the current campaign before starting another");
  const clean = String(name).trim().replace(/\s+/g, " ");
  if (clean.length < 3 || clean.length > 50) fail("Name the campaign in 3 to 50 characters");
  const goal = Number(goalUsd || 0);
  if (!(goal >= 0 && goal <= 100_000)) fail("A campaign target is $0 to $100,000");
  const campaign: Campaign = { id: newId("cmp"), streamerId: actor.id, name: clean, goalMicro: toMicro(goal), startedAt: Date.now() };
  (db().campaigns ??= []).push(campaign);
  save();
  return campaign;
}

export async function endCampaign(actor: User, campaignId: string): Promise<Campaign> {
  const campaign = (db().campaigns ?? []).find((c) => c.id === campaignId) ?? fail("Campaign not found");
  if (campaign.streamerId !== actor.id) fail("Only this campaign's climber can end it");
  if (campaign.endedAt) fail("This campaign has already ended");
  campaign.endedAt = Date.now();
  save();
  return campaign;
}

export interface CampaignStats {
  challenges: number;
  completed: number;
  live: number;
  /** Everything pledged to its challenges, including pots still open. */
  raisedMicro: number;
  /** What the climber has been paid from it. */
  earnedMicro: number;
  planters: number;
}

export function campaignStats(campaign: Campaign): CampaignStats {
  const list = db().challenges.filter((c) => c.campaignId === campaign.id);
  const ids = new Set(list.map((c) => c.id));
  return {
    challenges: list.length,
    completed: list.filter((c) => c.status === "paid").length,
    live: list.filter(isLive).length,
    raisedMicro: list.filter((c) => c.status !== "failed").reduce((sum, c) => sum + c.totalMicro, 0),
    earnedMicro: list.reduce((sum, c) => sum + earnedBy(c, campaign.streamerId), 0),
    planters: new Set(db().pledges.filter((p) => ids.has(p.challengeId)).map((p) => p.userId)).size,
  };
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

export interface PayoutRow {
  at: number;
  kind: "completed" | "upfront" | "gift" | "guest" | "request";
  label: string;
  amountMicro: number;
  /** Transaction id, for a receipt link. */
  tx?: string;
  href?: string;
}

/** Everything paid to a climber: completed pots, up-front shares, collab shares and gifts. Newest first. */
export function payoutsFor(streamer: User, limit = 40): { rows: PayoutRow[]; totalMicro: number } {
  const rows: PayoutRow[] = [];
  for (const c of stageChallenges(streamer.id)) {
    if (c.requestPaidMicro && c.streamerId === streamer.id) {
      const tx = db().backings.find((b) => b.bountyId === c.bountyId && b.outcome === "paid")?.payTx;
      rows.push({ at: c.lockedAt ?? c.createdAt, kind: "request", label: `Fan request taken on: ${c.title}`, amountMicro: c.requestPaidMicro, ...(tx ? { tx } : {}), href: `/c/${c.id}` });
    }
    const upfront = c.upfrontPaidMicro ?? 0;
    const guest = c.streamerId !== streamer.id;
    if (upfront > 0) {
      const amount = shareOf(c, streamer.id, upfront);
      if (amount > 0) rows.push({ at: c.lockedAt ?? c.createdAt, kind: "upfront", label: `Up-front share: ${c.title}`, amountMicro: amount, tx: c.txs.lock, href: `/c/${c.id}` });
    }
    if (c.status === "paid") {
      const amount = shareOf(c, streamer.id, c.totalMicro - upfront);
      if (amount > 0) rows.push({ at: c.settledAt ?? c.createdAt, kind: guest ? "guest" : "completed", label: guest ? `Collab share: ${c.title}` : c.title, amountMicro: amount, tx: c.txs.settle, href: `/c/${c.id}` });
    }
  }
  for (const g of db().gifts ?? []) {
    if (g.streamerId !== streamer.id) continue;
    rows.push({ at: g.at, kind: "gift", label: `Gift from ${getUser(g.fanId)?.name ?? "a planter"}`, amountMicro: g.amountMicro, tx: g.tx });
  }
  rows.sort((a, b) => b.at - a.at);
  return { rows: rows.slice(0, limit), totalMicro: rows.reduce((sum, r) => sum + r.amountMicro, 0) };
}

// ---------------------------------------------------------------------------
// The streamer's own announcer voice
// ---------------------------------------------------------------------------

/** Saves a voice cloned from the streamer's own recordings and makes it the announcer. Needs their consent, recorded with the time. */
export function setOwnVoice(actor: User, voiceId: string, consent: boolean, now = Date.now()): StreamSettings {
  if (actor.role !== "streamer") fail("Only a streamer can set an announcer voice");
  if (!consent) fail("Confirm that the recordings are your own voice and that you agree to cloning it");
  actor.settings = { ...settingsOf(actor), ownVoice: { id: voiceId, consentAt: now }, voice: "own" };
  save();
  return settingsOf(actor);
}

/** Forgets the streamer's cloned voice and goes back to a stock voice. Returns the id to delete on ElevenLabs. */
export function clearOwnVoice(actor: User): string | undefined {
  if (actor.role !== "streamer") fail("Only a streamer can change the announcer voice");
  const current = settingsOf(actor);
  const id = current.ownVoice?.id;
  actor.settings = { ...current, ownVoice: null, voice: current.voice === "own" ? "george" : current.voice };
  save();
  return id;
}

/** Why a wallet's pledge (from a Blink) would be refused, by the same rules as a pledge on the site; undefined if it is fine. */
export function walletPledgeProblem(challenge: Challenge, wallet: string, amountMicro: number): string | undefined {
  const fan = db().users.find((u) => u.wallet === wallet);
  if (fan && fan.role !== "fan") return "This wallet belongs to a streamer or keeper account";
  const already = fan ? db().pledges.filter((p) => p.challengeId === challenge.id && p.userId === fan.id).reduce((sum, p) => sum + p.amountMicro, 0) : 0;
  const problem = pledgeError(challenge, already, amountMicro, Date.now());
  if (problem) return problem;
  if (isOpenPot(challenge) && amountMicro > toMicro(10_000)) return "One pledge can be up to $10,000";
  const streamer = getUser(challenge.streamerId);
  const minMicro = toMicro(streamer ? settingsOf(streamer).minPledgeUsd : DEFAULT_SETTINGS.minPledgeUsd);
  if (amountMicro < minMicro) return `The smallest pledge on this stream is ${formatUsd(minMicro)}`;
  return undefined;
}

// ---------------------------------------------------------------------------
// Garden badges on Solana
// ---------------------------------------------------------------------------

/** Each earned badge's token, if it has been put on Solana. */
export function badgeMintsOf(user: User): Record<string, { mint: string; tx: string; at: number; kind?: "compressed" }> {
  const out: Record<string, { mint: string; tx: string; at: number; kind?: "compressed" }> = {};
  for (const [key, value] of Object.entries(db().badgeMints)) {
    const [userId, badgeId] = key.split(":");
    if (userId === user.id && badgeId) out[badgeId] = value;
  }
  return out;
}

/**
 * Puts a planter's earned badges into their wallet as soulbound tokens, one
 * per badge, once each. Only on the Solana ledger. `base` is the site's
 * public address, for each token's metadata link.
 */
export async function mintBadges(user: User, base: string): Promise<{ minted: string[] }> {
  if (user.role !== "fan") fail("Badges are for planters");
  const chain = ledger();
  if (chain.kind !== "solana") fail("Badges go on Solana only when the app runs on the Solana ledger");
  const { mintBadge } = await import("./badge-mint");
  const cnft = await import("./badge-cnft");
  const solana = chain as unknown as { connection: import("@solana/web3.js").Connection; server: import("@solana/web3.js").Keypair };
  // Compressed NFTs when the tree is set up; Token-2022 soulbound mints otherwise.
  const compressed = cnft.compressedBadgesOn();
  const umi = compressed ? cnft.badgeUmi(solana.connection.rpcEndpoint, solana.server) : undefined;
  const where = { tree: process.env.BADGE_TREE ?? "", collection: process.env.BADGE_COLLECTION ?? "" };
  const minted: string[] = [];
  for (const badge of planterStats(user).badges.filter((b) => b.earned)) {
    const key = `${user.id}:${badge.id}`;
    if (db().badgeMints[key]) continue;
    const meta = { id: badge.id, name: badge.name, uri: `${base}/api/badges/${badge.id}` };
    const result = umi ? await cnft.mintCompressedBadge(umi, where, user.wallet!, meta) : await mintBadge(solana.connection, solana.server, user.wallet, meta);
    db().badgeMints[key] = { ...result, at: Date.now(), ...(umi ? { kind: "compressed" as const } : {}) };
    save();
    minted.push(badge.id);
  }
  return { minted };
}

/** A badge by id, for its public metadata. */
export function badgeInfo(id: string): { id: string; name: string; how: string } | undefined {
  return BADGE_LIST.find((b) => b.id === id);
}

/** A planter who just joined from a stream picks the name the announcer reads. Letters, numbers and a few marks only. */
export function renameNewPlanter(user: User, name: string): void {
  const clean = name.replace(/[^\p{L}\p{N} ._'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 24);
  if (user.role !== "fan" || clean.length < 2) return;
  user.name = clean;
  save();
}

/**
 * The moments in a Stream delivery worth a post on X: a goal pot crossing
 * half its goal or reaching it, read from the program's own running total,
 * and a challenge settling. `base` is the site's public address.
 */
export function momentsFrom(events: { name: string; challenge: string; signature: string; fields: Record<string, string | number | boolean> }[], base: string) {
  const out: { challengeId: string; moment: import("@potted/coordinator").ChainMoment }[] = [];
  for (const e of events) {
    const challenge = db().challenges.find((c) => c.ledgerRef && chainAccountOf(c.ledgerRef) === e.challenge);
    if (!challenge) continue;
    const streamer = getUser(challenge.streamerId);
    const common = {
      streamer: streamer?.name ?? "A streamer",
      title: challenge.title,
      goal: challenge.goalMicro > 0 ? formatUsd(challenge.goalMicro) : undefined,
      planters: fundersOf(challenge.id).length,
      link: `${base}/c/${challenge.id}`,
      signature: e.signature,
    };
    if (e.name === "Pledged" && challenge.goalMicro > 0) {
      const after = Number(e.fields.totalPledged);
      const before = after - Number(e.fields.amount);
      const kind = before < challenge.goalMicro && after >= challenge.goalMicro ? "goal" : before * 2 < challenge.goalMicro && after * 2 >= challenge.goalMicro ? "half" : undefined;
      if (kind) out.push({ challengeId: challenge.id, moment: { kind, pot: formatUsd(after), ...common } });
    } else if (e.name === "Settled") {
      out.push({ challengeId: challenge.id, moment: { kind: e.fields.success ? "completed" : "missed", pot: formatUsd(Number(e.fields.success ? e.fields.paidOut : challenge.totalMicro)), ...common } });
    }
  }
  return out;
}
