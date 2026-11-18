import { briefWithGrok, draftWithGrok, recapWithGrok } from "./grok";
import { briefWithRules, draftWithRules } from "./rules";
import { type ScoutInput, type Scouting, scoutWithGrok, scoutWithRules } from "./scout";
import type { Brief, Deps, DisputeCase, Draft, Idea, RecapFacts } from "./types";

export type { Brief, Deps, DisputeCase, Draft, Idea, RecapFacts } from "./types";
export { draftWithRules, briefWithRules } from "./rules";
export type { Pitch, ScoutGame, ScoutInput, Scouting } from "./scout";
export { checkPitch, scoutWithRules } from "./scout";

/**
 * The challenge coordinator. It drafts and advises; it never creates a
 * challenge, moves money or rules on a dispute. With no XAI_API_KEY, or
 * when Grok fails, the same questions are answered by fixed rules.
 */

export function defaultDeps(): Deps {
  return { fetch: globalThis.fetch, env: process.env };
}

export function usesGrok(deps: Deps = defaultDeps()): boolean {
  return Boolean(deps.env.XAI_API_KEY);
}

/** Turns a fan's idea into suggested terms for the streamer to review. */
export async function draftTerms(idea: Idea, deps: Deps = defaultDeps()): Promise<Draft> {
  if (!usesGrok(deps)) return draftWithRules(idea);
  try {
    return await draftWithGrok(idea, deps);
  } catch (err) {
    return { ...draftWithRules(idea), fallback: reasonOf(err) };
  }
}

/** What a moderator should check before ruling on a disputed clip. */
export async function disputeBrief(c: DisputeCase, deps: Deps = defaultDeps()): Promise<Brief> {
  if (!usesGrok(deps)) return briefWithRules(c);
  try {
    return await briefWithGrok(c, deps);
  } catch {
    return briefWithRules(c);
  }
}

/** A short, safe reason for a failed Grok call: never the key or the raw body. */
export function reasonOf(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/abort|timeout/i.test(message)) return "Grok did not answer in time";
  if (/401|403/.test(message)) return "Grok rejected the API key";
  if (/404/.test(message)) return "Grok does not know that model (check XAI_MODEL)";
  if (/429/.test(message)) return "Grok rate limit or credits ran out";
  if (/Grok answered \d+/.test(message)) return message;
  if (/JSON|object|usable/i.test(message)) return "Grok's answer could not be used";
  return "Could not reach Grok";
}

/** Challenges the climber could pitch next. Grok with X and web search, or the climber's own record without it. */
export async function scout(input: ScoutInput, deps: Deps = defaultDeps()): Promise<Scouting> {
  if (!usesGrok(deps)) return scoutWithRules(input);
  try {
    return await scoutWithGrok(input, deps);
  } catch (err) {
    return { ...scoutWithRules(input), fallback: reasonOf(err) };
  }
}

/**
 * The spoken recap. Grok writes it from the stream's facts (and the escrow
 * program's on-chain activity); the fixed sentence version is used with no
 * key, or when Grok's text fails the figure check.
 */
export async function draftRecap(facts: RecapFacts, fallback: string, deps: Deps = defaultDeps()): Promise<{ text: string; source: "grok" | "rules" }> {
  if (!usesGrok(deps) || facts.challenges.length === 0) return { text: fallback, source: "rules" };
  try {
    return { text: await recapWithGrok(facts, deps), source: "grok" };
  } catch {
    return { text: fallback, source: "rules" };
  }
}
