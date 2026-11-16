import { GAMES } from "@potted/core";
import type { Brief, DisputeCase, Draft, Idea } from "./types";

/** Trims, collapses spaces and drops a trailing full stop, so the statement reads as a title. */
export function tidy(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ").replace(/[.!]+$/, "");
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

const SPEEDS = ["bullet", "blitz", "rapid", "classical"];

/**
 * Drafts terms with plain pattern matching. Used when no Grok key is set,
 * and as the fallback whenever Grok fails or returns something unusable.
 */
export function draftWithRules(idea: Idea): Draft {
  const game = GAMES.find((g) => g.id === idea.gameId) ?? GAMES[GAMES.length - 1]!;
  const text = idea.text.toLowerCase();
  const fields: Record<string, string> = {};
  const picked: string[] = [];

  switch (game.verifier) {
    case "lichess": {
      const speed = SPEEDS.find((s) => text.includes(s));
      if (speed) {
        fields.speed = speed;
        picked.push(`${speed} games`);
      }
      const rating = text.match(/\b([1-3]\d{3})\b/);
      if (rating) {
        fields.minOpponentRating = rating[1]!;
        picked.push(`opponents rated ${rating[1]}+`);
      }
      break;
    }
    case "brawlstars": {
      const outOf = text.match(/\b(\d{1,2})\s*(?:of|out of|\/)\s*(?:the\s+)?(?:next\s+)?(\d{1,2})\b/);
      const streak = text.match(/\b(\d{1,2})\s+(?:wins?|games?|battles?)\s+in a row\b/) ?? text.match(/\bwin\s+(\d{1,2})\b/);
      if (outOf && Number(outOf[1]) <= Number(outOf[2]) && Number(outOf[2]) <= 20) {
        fields.wins = outOf[1]!;
        fields.battles = outOf[2]!;
      } else if (streak && Number(streak[1]) >= 1 && Number(streak[1]) <= 20) {
        fields.wins = streak[1]!;
        fields.battles = streak[1]!;
      }
      if (fields.wins) picked.push(`${fields.wins} wins in ${fields.battles} battles`);
      break;
    }
    case "fortnite": {
      const kills = text.match(/\b(\d{1,3})\s*(?:kills?|elims?|eliminations?)\b/);
      const wins = text.match(/\b(\d{1,2})\s*(?:wins?|victory royales?|dubs?)\b/);
      if (kills) {
        fields.goal = "kills";
        fields.count = kills[1]!;
        picked.push(`${kills[1]} eliminations`);
      } else if (wins || /\bwin\b|victory royale/.test(text)) {
        fields.goal = "wins";
        fields.count = wins?.[1] ?? "1";
        picked.push(`${fields.count} Victory Royale${fields.count === "1" ? "" : "s"}`);
      }
      break;
    }
    case "optimistic":
      fields.statement = tidy(idea.text);
      break;
  }

  const note =
    game.verifier === "optimistic"
      ? "This one settles by clip. Make the statement something a viewer could confirm from the clip alone."
      : picked.length > 0
        ? `Picked up ${picked.join(" and ")} from the idea. Check the rest before opening it.`
        : `Nothing in the idea maps onto what ${game.name} data can check, so the form has its defaults. Set the terms yourself.`;
  return { gameId: game.id, fields, note, source: "rules" };
}

export function briefWithRules(c: DisputeCase): Brief {
  return {
    source: "rules",
    points: [
      `The claim to confirm: "${c.statement}".`,
      "The clip shows the whole attempt, with no cuts between the start and the result.",
      "The clip is from this stream and from after the attempt started, not an older recording.",
      `${c.disputes} of ${c.funders} funders disputed. If the clip leaves real doubt, rejecting refunds everyone.`,
    ],
  };
}
