import fs from "node:fs";
import path from "node:path";
import type { Challenge, Pledge } from "@potted/core";

/**
 * A small JSON-file store so the prototype runs with no database. Everything
 * goes through this module, so swapping in Postgres later touches one file.
 */

export type Role = "fan" | "streamer" | "mod";

export interface User {
  id: string;
  name: string;
  role: Role;
  /** Public URL handle; streamers only. */
  handle?: string;
  wallet: string;
  createdAt: number;
}

export type EventType = "created" | "pledged" | "locked" | "claimed" | "disputed" | "paid" | "failed" | "refunded";

/** What the overlay shows and reads aloud. */
export interface StreamEvent {
  seq: number;
  at: number;
  type: EventType;
  handle: string;
  challengeId: string;
  message: string;
}

export interface Db {
  users: User[];
  challenges: Challenge[];
  pledges: Pledge[];
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
