import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ChainEvent } from "@potted/chain";
import type { Challenge, Pledge } from "@potted/core";
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
  /** Which announcer voice reads events. */
  voice: VoiceKey;
  overlayPosition: OverlayPosition;
  /** How many live challenges the overlay shows at once. */
  overlayCards: 1 | 2;
  /** Show a QR code to the fan page on the overlay. */
  overlayQr: boolean;
  /** The streamer's Twitch login and YouTube handle, so the extension can match a tab to this stream. */
  twitchChannel: string;
  youtubeChannel: string;
  /** Charity stream: while on, every new challenge sends a share of a completed pot to the cause. */
  causeOn: boolean;
  causeName: string;
  /** Where viewers can read about the cause. Shown as given; not verified. */
  causeUrl: string;
  /** Whole percent of each completed pot. */
  causePct: number;
  /** Suggestions containing any of these are rejected. Lower-case. */
  blockedWords: string[];
}

export const DEFAULT_SETTINGS: StreamSettings = {
  acceptingSuggestions: true,
  acceptingBounties: true,
  minPledgeUsd: 1,
  announcer: true,
  voice: "george",
  overlayPosition: "bottom-left",
  overlayCards: 2,
  overlayQr: true,
  twitchChannel: "",
  youtubeChannel: "",
  causeOn: false,
  causeName: "",
  causeUrl: "",
  causePct: 50,
  blockedWords: [],
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
  /** Where the money went when the bounty closed. */
  outcome?: "pledged" | "returned";
  tx: string;
}

export interface User {
  id: string;
  name: string;
  role: Role;
  /** Public URL handle; streamers only. */
  handle?: string;
  /** Streamers only. Missing fields fall back to DEFAULT_SETTINGS. */
  settings?: Partial<StreamSettings>;
  wallet: string;
  createdAt: number;
  /** Accounts this user signs in with, e.g. Google. Demo users have none. */
  identities?: { provider: string; subject: string }[];
  email?: string;
  /** False until someone who signed in with a provider has picked planter or climber. */
  onboarded?: boolean;
}

export type EventType = "created" | "pledged" | "locked" | "claimed" | "disputed" | "paid" | "failed" | "refunded" | "milestone" | "recap" | "bounty";

/** What the overlay shows and reads aloud. */
export interface StreamEvent {
  seq: number;
  at: number;
  type: EventType;
  handle: string;
  /** Empty for stream-wide events such as the recap. */
  challengeId: string;
  message: string;
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
  invites: Invite[];
  /** Signs session cookies when SESSION_SECRET is not set. Made once per data file. */
  secret?: string;
  events: StreamEvent[];
  /** Sim ledger balances in micro-USDC, by wallet. */
  balances: Record<string, number>;
  seq: number;
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
    users: [
      {
        id: DEMO_STREAMER_ID,
        name: "Ryan",
        role: "streamer",
        handle: "ryan",
        wallet: `sim:${DEMO_STREAMER_ID}`,
        createdAt: Date.now(),
      },
      demoGuest(),
    ],
    challenges: [],
    pledges: [],
    suggestions: [],
    bounties: [],
    causeWallets: {},
    backings: [],
    chain: [],
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

const cache = globalThis as { __pottedDb?: Db };

export function db(): Db {
  if (!cache.__pottedDb) {
    try {
      cache.__pottedDb = JSON.parse(fs.readFileSync(dataFile(), "utf8")) as Db;
      // Files written before suggestions existed.
      cache.__pottedDb.suggestions ??= [];
      cache.__pottedDb.bounties ??= [];
      cache.__pottedDb.causeWallets ??= {};
      cache.__pottedDb.backings ??= [];
      cache.__pottedDb.chain ??= [];
      cache.__pottedDb.invites ??= [];
      if (!cache.__pottedDb.users.some((u) => u.id === DEMO_GUEST_ID)) cache.__pottedDb.users.push(demoGuest());
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
}

/** Test hook: start from a clean in-memory database that is never written. */
export function resetForTests(): void {
  cache.__pottedDb = seed();
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}
