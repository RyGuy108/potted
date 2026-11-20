import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ChainEvent } from "@potted/chain";
import type { ScoutInput, Scouting } from "@potted/coordinator";
import type { Challenge, Pledge } from "@potted/core";
import { demoAccountsOn } from "./demo-mode";
import { flushSupabase, loadFromSupabase, scheduleSync, supabaseConfigured, syncToSupabase } from "./supabase";
import type { VoiceKey } from "./voices";

/**
 * A small JSON-file store so the prototype runs with no database. Everything
 * goes through this module, so swapping in Postgres later touches one file.
 */

export type Role = "fan" | "streamer" | "mod";

export type OverlayPosition = "bottom-left" | "bottom-right" | "top-left" | "top-right";

/** What a streamer controls about their own stream. */
export interface StreamSettings {
  /** Whether fans can send challenge ideas. */
  acceptingSuggestions: boolean;
  /** Let planters put money on ideas before you accept them. */
  acceptingBounties: boolean;
  /** Smallest single pledge, in dollars. */
  minPledgeUsd: number;
  announcer: boolean;
  /** Which announcer voice reads events: a stock voice, or "own" for the streamer's cloned voice. */
  voice: VoiceKey | "own";
  /** The streamer's own voice, cloned on ElevenLabs with their consent. */
  ownVoice: { id: string; consentAt: number } | null;
  /** The language the announcer speaks (ISO 639-1). Lines are translated by Grok. */
  language: string;
  /** The !potted chat bot in this streamer's connected chats. */
  chatBot: boolean;
  overlayPosition: OverlayPosition;
  /** How many live challenges the overlay shows at once. */
  overlayCards: 1 | 2;
  /** Show a QR code to the fan page on the overlay. */
  overlayQr: boolean;
  /** A one-line aside from Grok under pledge alerts. Shown, not read aloud. */
  overlayCommentary: boolean;
  /** The streamer's Twitch login and YouTube handle, so the extension can match a tab to this stream. */
  twitchChannel: string;
  youtubeChannel: string;
  kickChannel: string;
  /** Charity stream: while on, every new challenge sends a share of a completed pot to the cause. */
  causeOn: boolean;
  causeName: string;
  /** Where viewers can read about the cause. Shown as given; not verified. */
  causeUrl: string;
  /** The cause's own Solana address. Without one, the server holds a wallet for it (fine on devnet only). */
  causeWallet: string;
  /** Whole percent of each completed pot. */
  causePct: number;
  /** Suggestions containing any of these are rejected. Lower-case. */
  blockedWords: string[];
  /** When nothing is live, the scout opens its next pitch on its own. */
  autopilot: boolean;
  /** Largest goal the scout may pitch, and autopilot may open, in dollars. */
  scoutMaxGoalUsd: number;
  /** Game ids fans may send ideas and bounties for, and the scout may pitch. Empty means all. */
  acceptedGames: string[];
}

export const DEFAULT_SETTINGS: StreamSettings = {
  acceptingSuggestions: true,
  acceptingBounties: true,
  minPledgeUsd: 1,
  announcer: true,
  voice: "george",
  ownVoice: null,
  language: "en",
  chatBot: true,
  overlayPosition: "bottom-left",
  overlayCards: 2,
  overlayQr: true,
  overlayCommentary: true,
  twitchChannel: "",
  youtubeChannel: "",
  kickChannel: "",
  causeOn: false,
  causeName: "",
  causeUrl: "",
  causeWallet: "",
  causePct: 50,
  blockedWords: [],
  autopilot: false,
  scoutMaxGoalUsd: 100,
  acceptedGames: [],
};

/** A fan's challenge idea, waiting for the streamer to use or dismiss it. */
export interface Suggestion {
  id: string;
  streamerId: string;
  userId: string;
  fanName: string;
  gameId: string;
  text: string;
  /** The game's name, when the fan picked "Anything else". */
  customGame?: string;
  createdAt: number;
  status: "pending" | "used" | "dismissed";
}

/**
 * Money put on an idea before the streamer has agreed to it. It is held
 * until the streamer accepts (it becomes a normal challenge and the money
 * becomes pledges) or declines, or the bounty expires (all of it goes back).
 */
export interface Bounty {
  id: string;
  streamerId: string;
  /** The planter who posted it. */
  creatorId: string;
  gameId: string;
  customGame?: string;
  text: string;
  createdAt: number;
  expiresAt: number;
  status: "open" | "accepted" | "declined" | "expired";
  challengeId?: string;
  closedAt?: number;
}

/** One planter's money on a bounty. */
export interface Backing {
  id: string;
  bountyId: string;
  userId: string;
  amountMicro: number;
  createdAt: number;
  /**
   * Where the money went. "held": the climber took the request on and it is
   * waiting for the attempt to start; "paid": it went to the climber when
   * the attempt started; "returned": back to the planter. "pledged" is from
   * before requests paid at the start, when it became a completion pledge.
   */
  outcome?: "held" | "paid" | "returned" | "pledged";
  payTx?: string;
  tx: string;
}

export interface User {
  profile?: import("./account-types").AccountProfile;
  id: string;
  name: string;
  role: Role;
  /** Public URL handle; streamers only. */
  handle?: string;
  /** Streamers only. Missing fields fall back to DEFAULT_SETTINGS. */
  settings?: Partial<StreamSettings>;
  /** The stream a climber said they started, from the link they pasted. */
  liveSession?: LiveSession;
  wallet: string;
  createdAt: number;
  /** Accounts this user signs in with, e.g. Google. Demo users have none. */
  identities?: { provider: string; subject: string }[];
  email?: string;
  emailVerified?: boolean;
  /** Providers explicitly disconnected, which must be linked manually again. */
  disconnectedProviders?: string[];
  /** False until someone who signed in with a provider has picked planter or climber. */
  onboarded?: boolean;
  /** Awards this user has already been told about, so each is announced once. */
  awarded?: { badges: string[]; level: number; milestones: string[] };
}

export type EventType = "created" | "pledged" | "locked" | "claimed" | "disputed" | "paid" | "failed" | "refunded" | "milestone" | "recap" | "bounty" | "redeemed" | "gift" | "charity" | "comment";

/** USDC that reached a cause's wallet, as the charity Stream reported it from the chain. */
export interface CauseReceipt {
  /** Signature and wallet: one per wallet per transaction. */
  key: string;
  signature: string;
  wallet: string;
  amountMicro: number;
  slot: number;
  /** Block time in ms. */
  at: number;
}

/** What the overlay shows and reads aloud. */
export interface LiveSession {
  platform: "twitch" | "youtube" | "kick";
  channel: string;
  url: string;
  title?: string;
  /** The platform's category, and the Potted game it maps to. */
  category?: string;
  gameId: string;
  customGame?: string;
  startedAt: number;
}

export interface StreamEvent {
  seq: number;
  at: number;
  type: EventType;
  handle: string;
  /** Empty for stream-wide events such as the recap. */
  challengeId: string;
  message: string;
  /** A sound effect the overlay plays before the line: half way to the goal, or the goal reached. */
  sfx?: "half" | "goal";
  /** Who wrote the line, when it was not a fixed sentence. */
  by?: "grok";
  /** For an aside ("comment"): the pledge line it reacts to. */
  about?: number;
  /**
   * For a pledge made on Solana: when the transaction was confirmed and
   * when the QuickNode Stream delivered it (server clock, ms), so the
   * overlay can show how fast it got on screen.
   */
  chain?: { signature: string; confirmedAt: number; streamAt?: number };
}

export interface Db {
  users: User[];
  challenges: Challenge[];
  pledges: Pledge[];
  suggestions: Suggestion[];
  bounties: Bounty[];
  /** On Solana, the wallet each named cause's share is paid into, until causes have verified addresses. */
  causeWallets: Record<string, string>;
  backings: Backing[];
  /** Escrow events delivered by the QuickNode Stream. */
  chain: ChainEvent[];
  causeReceipts: CauseReceipt[];
  /** Garden badges put on Solana, by "<user id>:<badge id>". */
  /** "compressed": a Bubblegum leaf, and `mint` is its asset id. Absent: a Token-2022 mint. */
  badgeMints: Record<string, { mint: string; tx: string; at: number; kind?: "compressed" }>;
  /** Test USDC the faucet has given each wallet through Blinks (see blink-limits.ts). */
  blinkTopUps?: Record<string, number>;
  /** Grok's posts on X about on-chain moments (see x-posts.ts). */
  xPosts?: import("./x-posts").XPost[];
  invites: Invite[];
  /** Signs session cookies when SESSION_SECRET is not set. Made once per data file. */
  secret?: string;
  events: StreamEvent[];
  /** Sim ledger balances in micro-USDC, by wallet. */
  balances: Record<string, number>;
  seq: number;
  /** In-app notifications, newest last. */
  notices?: Notice[];
  /** The Twitch session each climber was last announced live for. */
  liveAnnounced?: Record<string, string>;
  /** Planters following climbers. */
  follows?: { fanId: string; streamerId: string; at: number }[];
  /** Each climber's channel points: how planters earn them and what they buy. */
  points?: Record<string, PointsConfig>;
  /** Gifts: money a planter gave a climber straight, with no challenge. */
  gifts?: Gift[];
  /** Rewards planters have redeemed. */
  redemptions?: Redemption[];
  /** The scout's latest pitches for each climber. */
  scouts?: Record<string, ScoutRun>;
  /** Streamers' campaigns: a named run of challenges with an overall goal. */
  campaigns?: Campaign[];
  /** Pending email sign-in codes, hashed, by email. */
  emailCodes?: Record<string, { hash: string; expires: number; tries: number; sentAt: number }>;
  /** Kick chat messages waiting to be sent (replies, announcements). See kick.ts. */
  kickOutbox?: import("./kick").KickOutboxItem[];
  /** Kick webhook message ids already accepted, with when, so a redelivery is handled once. */
  kickSeen?: Record<string, number>;
  /** Wallets Privy holds: address to Privy wallet id. */
  privyWallets?: Record<string, string>;
  /** Set while the demo sample is loaded: live challenges it opened, so it can be removed again. */
  sample?: { challengeIds: string[]; addedAt: number };
  /** One-time clean slates already run on this state (see purge.ts). */
  purges?: string[];
}

/** A named run of challenges, like "Road to 2000" or a week-long charity drive. New challenges join the running one. */
export interface Campaign {
  id: string;
  streamerId: string;
  name: string;
  /** What the whole campaign aims to raise, in micro-USDC. 0 for no target. */
  goalMicro: number;
  startedAt: number;
  endedAt?: number;
}

export type NoticeKind = "gift" | "award" | "challenge" | "money" | "refund" | "clip" | "dispute" | "idea" | "invite" | "points" | "follow";

export interface Notice {
  id: string;
  userId: string;
  at: number;
  kind: NoticeKind;
  title: string;
  body: string;
  href: string;
  read: boolean;
}

export interface Gift {
  id: string;
  fanId: string;
  streamerId: string;
  amountMicro: number;
  note: string;
  at: number;
  tx: string;
}

/** Something a planter can spend a climber's channel points on. */
export interface Reward {
  id: string;
  title: string;
  cost: number;
  /** What the planter gets, in the climber's words. */
  note: string;
  /** Asks the planter for a line of text (a game to pick, a name to shout out). */
  needsInput: boolean;
  enabled: boolean;
}

export interface PointsConfig {
  on: boolean;
  /** Points per dollar a planter puts into this climber's pots. */
  perUsd: number;
  /** "pledged": earned on pledging, taken back if refunded. "completed": only for pots that completed. */
  when: "pledged" | "completed";
  rewards: Reward[];
}

export interface Redemption {
  id: string;
  streamerId: string;
  userId: string;
  rewardId: string;
  title: string;
  cost: number;
  input: string;
  at: number;
  status: "pending" | "fulfilled" | "refunded";
  resolvedAt?: number;
}

/** One scouting run and what became of its pitches. */
export interface ScoutRun extends Scouting {
  at: number;
  /** Challenge ids by pitch index, once opened. */
  opened: Record<number, string>;
  /** When autopilot last opened one, so it waits between them. */
  autoAt?: number;
  /** What the scout read from the chain, for the panel. */
  chain: ScoutInput["chain"];
}

export const DEMO_STREAMER_ID = "u_demo_streamer";
/** A second demo streamer, so collabs can be shown without real accounts. */
export const DEMO_GUEST_ID = "u_demo_streamer_kai";

const demoGuest = (): User => ({
  id: DEMO_GUEST_ID,
  name: "Kai",
  role: "streamer",
  handle: "kai",
  wallet: `sim:${DEMO_GUEST_ID}`,
  createdAt: Date.now(),
});

/** A host's offer to run a challenge with another streamer. It becomes a challenge only if the guest accepts. */
export interface Invite {
  id: string;
  hostId: string;
  guestId: string;
  /** The guest's whole-percent share of a successful pot. */
  guestPct: number;
  /** The challenge exactly as the host wrote it. */
  input: { gameId: string; condition: unknown; goalUsd: number; pledgeCapUsd: number; minutes: number; upfrontPct?: number };
  title: string;
  createdAt: number;
  status: "pending" | "accepted" | "declined" | "withdrawn";
  challengeId?: string;
}

function seed(): Db {
  return {
    users: demoAccountsOn()
      ? [
          {
            id: DEMO_STREAMER_ID,
            name: "Ryan",
            role: "streamer",
            handle: "ryan",
            wallet: `sim:${DEMO_STREAMER_ID}`,
            createdAt: Date.now(),
          },
          demoGuest(),
        ]
      : [],
    challenges: [],
    pledges: [],
    suggestions: [],
    bounties: [],
    causeWallets: {},
    backings: [],
    chain: [],
    causeReceipts: [],
    badgeMints: {},
    invites: [],
    events: [],
    balances: {},
    seq: 0,
  };
}

function dataFile(): string {
  const dir = process.env.POTTED_DATA_DIR ?? path.join(process.cwd(), ".data");
  return path.join(dir, "potted.json");
}

const cache = globalThis as { __pottedDb?: Db; __pottedHydrated?: boolean };

/** Fills in collections that older saves did not have. */
function upgrade(state: Db): Db {
  state.suggestions ??= [];
  state.bounties ??= [];
  state.causeWallets ??= {};
  state.backings ??= [];
  state.chain ??= [];
  state.causeReceipts ??= [];
  state.badgeMints ??= {};
  state.invites ??= [];
  state.events ??= [];
  state.balances ??= {};
  state.seq ??= 0;
  if (demoAccountsOn() && !state.users.some((u) => u.id === DEMO_GUEST_ID)) state.users.push(demoGuest());
  return state;
}

/**
 * With Supabase set up, loads the state from it before the first request
 * (instrumentation.ts calls this when the server starts). On the first run,
 * Supabase is empty and gets everything the local file holds.
 */
export async function hydrate(): Promise<"supabase" | "pushed" | "file"> {
  if (!supabaseConfigured() || cache.__pottedHydrated) return "file";
  cache.__pottedHydrated = true;
  const loaded = await loadFromSupabase();
  if (loaded) {
    cache.__pottedDb = upgrade(loaded);
    return "supabase";
  }
  await syncToSupabase(db());
  return "pushed";
}

/** Waits for writes to Supabase to finish. Scripts call this before exiting. */
export async function flush(): Promise<void> {
  await flushSupabase(db);
}

export function db(): Db {
  if (!cache.__pottedDb) {
    try {
      // Files written by older versions lack newer collections; upgrade fills them in.
      cache.__pottedDb = upgrade(JSON.parse(fs.readFileSync(dataFile(), "utf8")) as Db);
    } catch {
      cache.__pottedDb = seed();
    }
  }
  return cache.__pottedDb;
}

/** Writes through a temp file so a crash cannot leave half a file. */
/** The key session cookies are signed with. Set SESSION_SECRET when hosting; otherwise one is kept with the data. */
export function sessionSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const state = db();
  if (!state.secret) {
    state.secret = randomBytes(32).toString("hex");
    save();
  }
  return state.secret;
}

export function save(): void {
  const file = dataFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // A temp file per write, so two writers (two requests, or two test
  // workers) never rename each other's half-written file.
  const tmp = `${file}.${process.pid}.${crypto.randomUUID().slice(0, 8)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db()));
  fs.renameSync(tmp, file);
  (globalThis as { __pottedSavedAt?: number }).__pottedSavedAt = Date.now();
  scheduleSync(db);
}

/** The folder the data file and wallet keys live in. */
export function dataDir(): string {
  return path.dirname(dataFile());
}

export function lastSavedAt(): number | null {
  return (globalThis as { __pottedSavedAt?: number }).__pottedSavedAt ?? null;
}

/** Swaps the whole in-memory state (used by purge.ts). Call save() after. */
export function replaceDb(state: Db): void {
  cache.__pottedDb = state;
}

/** Test hook: start from a clean in-memory database that is never written. */
export function resetForTests(): void {
  cache.__pottedDb = seed();
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}
