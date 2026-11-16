import { briefWithGrok, draftWithGrok } from "./grok";
import { briefWithRules, draftWithRules } from "./rules";
import type { Brief, Deps, DisputeCase, Draft, Idea } from "./types";

export type { Brief, Deps, DisputeCase, Draft, Idea } from "./types";
export { draftWithRules, briefWithRules } from "./rules";

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
  } catch {
    return draftWithRules(idea);
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
