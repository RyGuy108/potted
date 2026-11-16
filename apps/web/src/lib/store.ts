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
  /** Suggestions containing any of these are rejected. Lower-case. */
  blockedWords: string[];
}

export const DEFAULT_SETTINGS: StreamSettings = {
  acceptingSuggestions: true,
  minPledgeUsd: 1,
  announcer: true,
  voice: "george",
  overlayPosition: "bottom-left",
  overlayCards: 2,
  overlayQr: true,
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
  createdAt: number;
  status: "pending" | "used" | "dismissed";
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
}

export type EventType = "created" | "pledged" | "locked" | "claimed" | "disputed" | "paid" | "failed" | "refunded" | "milestone" | "recap";

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
  /** Escrow events delivered by the QuickNode Stream. */
  chain: ChainEvent[];
  events: StreamEvent[];
  /** Sim ledger balances in micro-USDC, by wallet. */
  balances: Record<string, number>;
  seq: number;
}

export const DEMO_STREAMER_ID = "u_demo_streamer";

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
    ],
    challenges: [],
    pledges: [],
    suggestions: [],
    chain: [],
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
      cache.__pottedDb.chain ??= [];
    } catch {
      cache.__pottedDb = seed();
    }
  }
  return cache.__pottedDb;
}

/** Writes through a temp file so a crash cannot leave half a file. */
export function save(): void {
  const file = dataFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(db()));
  fs.renameSync(`${file}.tmp`, file);
}

/** Test hook: start from a clean in-memory database that is never written. */
export function resetForTests(): void {
  cache.__pottedDb = seed();
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}
