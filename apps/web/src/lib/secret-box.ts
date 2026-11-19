import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { sessionSecret } from "./store";

/**
 * Authenticated encryption (AES-256-GCM) for secrets Potted keeps on disk
 * and in Supabase, such as a streamer's Kick tokens.
 *
 * The key comes from POTTED_TOKEN_KEY (32 random bytes, base64 or hex). When
 * that is not set it is derived from SESSION_SECRET with HKDF, so hosting
 * needs no new variable; changing SESSION_SECRET then means streamers
 * reconnect Kick. Generate a dedicated key with:
 *
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

const PREFIX = "pbox1:";

function key(): Buffer {
  const fixed = process.env.POTTED_TOKEN_KEY?.trim();
  if (fixed) {
    const raw = /^[0-9a-f]{64}$/i.test(fixed) ? Buffer.from(fixed, "hex") : Buffer.from(fixed, "base64");
    if (raw.length !== 32) throw new Error("POTTED_TOKEN_KEY must be 32 bytes (base64 or hex)");
    return raw;
  }
  return Buffer.from(hkdfSync("sha256", sessionSecret(), "potted-secret-box", "token-encryption-v1", 32));
}

export function seal(plain: string, aad = ""): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(aad));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** Throws when the box was tampered with, bound to other data, or sealed with another key. */
export function open(boxed: string, aad = ""): string {
  if (!boxed.startsWith(PREFIX)) throw new Error("Not a sealed value");
  const raw = Buffer.from(boxed.slice(PREFIX.length), "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

export function isSealed(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PREFIX);
}
