import { type ChainMoment, type PledgeFacts, briefWithGrok, checkComment, checkPost, commentWithGrok, draftWithGrok, postLength, postWithGrok, recapWithGrok, translateWithGrok } from "./grok";
export { type ChainMoment, type PledgeFacts, checkComment, checkPost, postLength } from "./grok";
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

/**
 * An announcer line in the stream's language. Grok translates it; with no
 * key, or when the translation fails its checks, the line stays as written.
 */
export async function translateLine(text: string, language: string, deps: Deps = defaultDeps()): Promise<{ text: string; translated: boolean }> {
  if (!usesGrok(deps) || !language || /^english$/i.test(language)) return { text, translated: false };
  try {
    return { text: await translateWithGrok(text, language, deps), translated: true };
  } catch {
    return { text, translated: false };
  }
}

/** A fixed post for each kind of moment, used with no Grok key or when Grok's draft fails the checks. */
export function postByRules(m: ChainMoment): string {
  const of = m.goal ? ` of ${m.goal}` : "";
  const text = {
    half: `Half way there: ${m.pot}${of} pledged for ${m.streamer}'s challenge "${m.title}". It pays only if they pull it off. Back it: ${m.link}`,
    goal: `Goal reached: ${m.pot} in escrow for ${m.streamer}'s challenge "${m.title}". Now they have to pull it off. Watch or back it: ${m.link}`,
    completed: `${m.streamer} did it: "${m.title}" is complete and the ${m.pot} pot was paid out on Solana. Thank you, ${m.planters} planters. ${m.link}`,
    missed: `${m.streamer} missed "${m.title}" this time. All ${m.planters} planters are refunded automatically from escrow. ${m.link}`,
  }[m.kind];
  // A very long title can push the fixed text over the limit: shorten the title, never the link.
  if (postLength(text) <= 280) return text;
  return postByRules({ ...m, title: `${m.title.slice(0, Math.max(10, m.title.length - (postLength(text) - 280) - 1))}…` });
}

/** Grok writes the post about an on-chain moment; with no key, or a draft that fails the checks, the fixed text is used. */
export async function draftPost(moment: ChainMoment, deps: Deps = defaultDeps()): Promise<{ text: string; source: "grok" | "rules" }> {
  if (usesGrok(deps)) {
    try {
      return { text: await postWithGrok(moment, deps), source: "grok" };
    } catch {
      // fall through to the fixed text
    }
  }
  return { text: checkPost(postByRules(moment), moment), source: "rules" };
}

/**
 * A fixed aside on what makes a pledge notable, or undefined when nothing
 * does (the plain pledge line already says who and how much).
 */
export function commentByRules(f: PledgeFacts): string | undefined {
  const first = f.planter.split(" ")[0] ?? f.planter;
  if (f.firstOnChallenge) return `${first} plants the very first bean on this one.`;
  if (f.biggestOnChallenge && f.planters > 1) return `That is the biggest pledge on this challenge so far.`;
  if (f.toGo && f.minutesLeft !== undefined && f.minutesLeft <= 5) return `Only ${f.toGo} to go, with ${f.minutesLeft} ${f.minutesLeft === 1 ? "minute" : "minutes"} on the clock.`;
  if (f.planterPledgesTonight >= 2) return `${first} is back again: pledge number ${f.planterPledgesTonight} tonight.`;
  if (f.toGo && f.goal) return `Only ${f.toGo} left until the ${f.goal} goal.`;
  return undefined;
}

/**
 * The overlay's one-line aside on a pledge. Grok writes it from the facts;
 * with no key, or a line that fails the checks, the fixed aside is used.
 */
export async function commentOnPledge(facts: PledgeFacts, deps: Deps = defaultDeps()): Promise<{ text: string; source: "grok" | "rules" } | undefined> {
  if (usesGrok(deps)) {
    try {
      return { text: await commentWithGrok(facts, deps), source: "grok" };
    } catch {
      // fall through to the fixed aside
    }
  }
  const text = commentByRules(facts);
  return text ? { text: checkComment(text, facts), source: "rules" } : undefined;
}
