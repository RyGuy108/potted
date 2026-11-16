import { createHash } from "node:crypto";
import { base58 } from "./base58";

/** The escrow program's events, in the field order the program writes them. */
const LAYOUTS = {
  ChallengeCreated: [["challenge", "pubkey"], ["streamer", "pubkey"], ["id", "u64"], ["deadline", "i64"], ["settleBy", "i64"]],
  Pledged: [["challenge", "pubkey"], ["fan", "pubkey"], ["amount", "u64"], ["totalPledged", "u64"]],
  Locked: [["challenge", "pubkey"], ["totalPledged", "u64"]],
  Cancelled: [["challenge", "pubkey"], ["totalPledged", "u64"]],
  Settled: [["challenge", "pubkey"], ["success", "bool"], ["paidOut", "u64"], ["evidenceRef", "string"]],
  Refunded: [["challenge", "pubkey"], ["fan", "pubkey"], ["amount", "u64"]],
} as const satisfies Record<string, readonly (readonly [string, "pubkey" | "u64" | "i64" | "bool" | "string"])[]>;

export type EventName = keyof typeof LAYOUTS;
export const EVENT_NAMES = Object.keys(LAYOUTS) as EventName[];

export interface EscrowEvent {
  name: EventName;
  /** The challenge account's address. */
  challenge: string;
  fields: Record<string, string | number | boolean>;
}

/** Anchor tags each event with the first 8 bytes of sha256("event:<Name>"). */
export function discriminator(name: string): Buffer {
  return createHash("sha256").update(`event:${name}`).digest().subarray(0, 8);
}

const BY_DISCRIMINATOR = new Map(EVENT_NAMES.map((name) => [discriminator(name).toString("hex"), name]));

function decodeEvent(data: Buffer): EscrowEvent | undefined {
  const name = BY_DISCRIMINATOR.get(data.subarray(0, 8).toString("hex"));
  if (!name) return undefined;
  const fields: Record<string, string | number | boolean> = {};
  let at = 8;
  try {
    for (const [field, type] of LAYOUTS[name]) {
      if (type === "pubkey") {
        if (at + 32 > data.length) return undefined;
        fields[field] = base58(data.subarray(at, at + 32));
        at += 32;
      } else if (type === "u64" || type === "i64") {
        // Token amounts and timestamps fit in a double with room to spare.
        fields[field] = Number(type === "u64" ? data.readBigUInt64LE(at) : data.readBigInt64LE(at));
        at += 8;
      } else if (type === "bool") {
        fields[field] = data.readUInt8(at) === 1;
        at += 1;
      } else {
        const length = data.readUInt32LE(at);
        at += 4;
        if (at + length > data.length) return undefined;
        fields[field] = data.subarray(at, at + length).toString("utf8");
        at += length;
      }
    }
  } catch {
    return undefined; // truncated data
  }
  return { name, challenge: String(fields.challenge), fields };
}

/**
 * Reads the escrow program's events out of one transaction's log lines.
 *
 * Any program can log "Program data:", so a line only counts while our
 * program is the one executing. Otherwise another program could print a
 * fake "Settled" event in a transaction that merely mentions ours.
 */
export function decodeLogs(logs: readonly string[], programId: string): EscrowEvent[] {
  const events: EscrowEvent[] = [];
  const stack: string[] = [];
  for (const line of logs) {
    const invoke = line.match(/^Program (\S+) invoke \[\d+\]$/);
    if (invoke) {
      stack.push(invoke[1]!);
      continue;
    }
    if (/^Program \S+ (success|failed)/.test(line)) {
      stack.pop();
      continue;
    }
    if (line.startsWith("Program data: ") && stack[stack.length - 1] === programId) {
      const event = decodeEvent(Buffer.from(line.slice("Program data: ".length), "base64"));
      if (event) events.push(event);
    }
  }
  return events;
}
