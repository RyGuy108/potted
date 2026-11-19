import { formatUsd } from "@potted/core";
import * as service from "./service";
import type { User } from "./store";

/**
 * What the !potted bot says, shared by every chat platform. Kept apart from
 * the platform code so Kick and the others can use it without importing
 * each other.
 */

export const publicBaseUrl = () => (process.env.POTTED_PUBLIC_URL ?? "http://localhost:3000").replace(/\/+$/, "");

export function botOn(streamer: User): boolean {
  return service.settingsOf(streamer).chatBot !== false;
}

/** Which command a chat line is, if any. Replies never start with "!", so the bot cannot answer itself. */
export function commandOf(text: string): "potted" | "top" | undefined {
  const words = text.trim().toLowerCase().split(/\s+/);
  if (words[0] !== "!potted" && words[0] !== "!pot") return undefined;
  return words[1] === "top" ? "top" : "potted";
}

/**
 * The challenge !potted talks about when several are open: the fullest pot,
 * then the oldest, then by id, so the answer never flips between two.
 */
export function featuredChallenge(streamerId: string, now = Date.now()) {
  const open = service
    .stageChallenges(streamerId)
    .filter((c) => c.status === "open" && c.deadline > now)
    .sort((a, b) => b.totalMicro - a.totalMicro || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  return { challenge: open[0], others: Math.max(0, open.length - 1) };
}

/** The bot's answer to a chat message, or undefined when it is not a command for us. */
export function replyTo(streamer: User, text: string, siteBase = publicBaseUrl()): string | undefined {
  const command = commandOf(text);
  if (!command || !streamer.handle) return undefined;
  if (command === "top") {
    // Display names only: never emails, wallets or ids.
    const top = service.topPlanters(streamer.id, 3);
    if (!top.length) return `No planters yet. Be the first: ${siteBase}/j/${streamer.handle}`;
    return `Top planters: ${top.map((t, i) => `${i + 1}. ${t.name} ${formatUsd(t.amountMicro)}`).join(" · ")}`;
  }
  const { challenge: c, others } = featuredChallenge(streamer.id);
  if (!c) return `No challenge is open right now. Suggest one: ${siteBase}/s/${streamer.handle}`;
  const goal = c.goalMicro > 0 ? ` of ${formatUsd(c.goalMicro)}` : "";
  const more = others ? ` (+${others} more)` : "";
  return `🌱 ${c.title}: ${formatUsd(c.totalMicro)}${goal} from ${service.fundersOf(c.id).length} planters${more}. Pays only if ${streamer.name} pulls it off. Back it: ${siteBase}/j/${streamer.handle}`;
}

/** Chat messages are short; long titles are cut, links never. */
export function fitChat(text: string, max = 400): string {
  if (text.length <= max) return text;
  const link = text.match(/https?:\/\/\S+$/)?.[0] ?? "";
  return `${text.slice(0, max - link.length - 2).trimEnd()}… ${link}`.trim();
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Kick's limits: 500 grapheme clusters and 2048 UTF-8 bytes. Cuts the text, keeps a trailing link. */
export function fitKick(text: string, maxGraphemes = 500, maxBytes = 2048): string {
  const clean = text.replace(/[\r\n]+/g, " ");
  const fits = (s: string) => [...segmenter.segment(s)].length <= maxGraphemes && Buffer.byteLength(s, "utf8") <= maxBytes;
  if (fits(clean)) return clean;
  const link = clean.match(/\s(https?:\/\/\S+)$/)?.[1] ?? "";
  const head = [...segmenter.segment(link ? clean.slice(0, clean.length - link.length).trimEnd() : clean)].map((s) => s.segment);
  let lo = 0;
  let hi = head.length;
  // The longest head that still fits with "… " and the link.
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(`${head.slice(0, mid).join("").trimEnd()}…${link ? ` ${link}` : ""}`)) lo = mid;
    else hi = mid - 1;
  }
  return `${head.slice(0, lo).join("").trimEnd()}…${link ? ` ${link}` : ""}`;
}

/** The three moments a streamer can have announced in chat. */
export type AnnouncementKind = "started" | "goal" | "result";

/** Which announcement an overlay event is, from Potted's own challenge events only. */
export function announcementKind(type: string, sfx?: string): AnnouncementKind | undefined {
  if (type === "locked") return "started";
  if (type === "milestone" && sfx === "goal") return "goal";
  if (type === "paid" || type === "failed") return "result";
  return undefined;
}
