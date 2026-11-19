import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dataDir, lastSavedAt } from "./store";
import { supabaseConfigured } from "./supabase";

/**
 * Running Potted as one server. All live state is in one process and one
 * data folder (the JSON file and the custodial wallet keys), so exactly one
 * server may use a data folder. On Railway that is the service with its
 * volume and one replica. This module:
 *
 * - claims the data folder with a lock file and a heartbeat, and warns
 *   loudly if another live server already holds it;
 * - snapshots the data file and wallet keys every hour, keeping 48;
 * - reports both on /api/health.
 *
 * With Supabase set up, every save is also mirrored there and loaded back
 * on start, so a lost volume can be rebuilt (wallet keys excepted: keep
 * the backups, or use Privy wallets).
 */

const BEAT_MS = 15_000;
const STALE_MS = 45_000;
const KEEP_BACKUPS = 48;

interface Lock {
  id: string;
  host: string;
  pid: number;
  startedAt: number;
  beat: number;
}

const me: Lock = { id: `${os.hostname()}:${process.pid}:${Date.now()}`, host: os.hostname(), pid: process.pid, startedAt: Date.now(), beat: Date.now() };
const g = globalThis as { __pottedOps?: { started: boolean; conflict: Lock | null; lastBackup: string | null } };
const state = (g.__pottedOps ??= { started: false, conflict: null, lastBackup: null });

const lockFile = () => path.join(dataDir(), "server.lock");

function readLock(): Lock | null {
  try {
    return JSON.parse(fs.readFileSync(lockFile(), "utf8")) as Lock;
  } catch {
    return null;
  }
}

function writeLock(): void {
  me.beat = Date.now();
  fs.mkdirSync(dataDir(), { recursive: true });
  const tmp = `${lockFile()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(me));
  fs.renameSync(tmp, lockFile());
}

/**
 * Claims the data folder. If another server's heartbeat is fresh, both are
 * writing the same file and one of them will lose saves: say so loudly.
 * The newest server takes the lock either way (during a redeploy the old
 * one is about to stop).
 */
export function claimDataDir(now = Date.now()): Lock | null {
  const held = readLock();
  state.conflict = held && held.id !== me.id && now - held.beat < STALE_MS ? held : null;
  if (state.conflict) {
    console.error(
      `[potted] Another server (${state.conflict.host}, pid ${state.conflict.pid}) is using the data folder ${dataDir()}. Run exactly one server per data folder, or saves will be lost.`,
    );
  }
  writeLock();
  return state.conflict;
}

/** Heartbeat: keeps our claim fresh, and notices if another server took the folder over. */
function beat(): void {
  const held = readLock();
  if (held && held.id !== me.id && Date.now() - held.beat < STALE_MS) {
    if (state.conflict?.id !== held.id) console.error(`[potted] Another server (${held.host}, pid ${held.pid}) started using ${dataDir()}.`);
    state.conflict = held;
    return;
  }
  writeLock();
}

/** Copies the data file and wallet keys into backups/, keeping the newest 48 of each. */
export function backup(now = new Date()): string | null {
  const dir = dataDir();
  const out = path.join(dir, "backups");
  const stamp = now.toISOString().slice(0, 13).replace(/[-T:]/g, "");
  let made: string | null = null;
  for (const name of ["potted.json", "wallets.json"]) {
    const from = path.join(dir, name);
    if (!fs.existsSync(from)) continue;
    fs.mkdirSync(out, { recursive: true, mode: 0o700 });
    const to = path.join(out, `${name.replace(".json", "")}-${stamp}.json`);
    fs.copyFileSync(from, to);
    if (name === "wallets.json") fs.chmodSync(to, 0o600);
    made = to;
    const old = fs
      .readdirSync(out)
      .filter((f) => f.startsWith(`${name.replace(".json", "")}-`))
      .sort();
    for (const f of old.slice(0, Math.max(0, old.length - KEEP_BACKUPS))) fs.rmSync(path.join(out, f));
  }
  state.lastBackup = made ? path.basename(made) : state.lastBackup;
  return made;
}

export function startOps(): void {
  if (state.started || process.env.VITEST) return;
  state.started = true;
  claimDataDir();
  setInterval(beat, BEAT_MS).unref?.();
  backup();
  setInterval(() => {
    try {
      backup();
    } catch (error) {
      console.error("[potted] backup failed:", error instanceof Error ? error.message : error);
    }
  }, 60 * 60_000).unref?.();
}

export function opsStatus() {
  return {
    store: supabaseConfigured() ? "file, mirrored to Supabase" : "file",
    lastSavedAt: lastSavedAt(),
    lastBackup: state.lastBackup,
    otherServer: state.conflict ? { host: state.conflict.host, pid: state.conflict.pid, lastSeen: state.conflict.beat } : null,
  };
}
