/** Everything the coordinator needs from outside, so tests can fake it. */
export interface Deps {
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
}

export interface Idea {
  gameId: string;
  text: string;
}

/**
 * Suggested terms for a challenge. A draft only pre-fills the streamer's
 * form: the streamer still reviews it, and the normal condition parser
 * still validates whatever is submitted.
 */
export interface Draft {
  gameId: string;
  /**
   * Form values to pre-fill. Account names and player tags are never
   * drafted: those identify whose results count, so the streamer types them.
   */
  fields: Record<string, string>;
  /** One line telling the streamer what was changed and why. */
  note: string;
  source: "grok" | "rules";
}

export interface DisputeCase {
  title: string;
  statement: string;
  game: string;
  disputes: number;
  funders: number;
}

/** Points for a moderator to check. Advice only; a person makes the ruling. */
export interface Brief {
  points: string[];
  source: "grok" | "rules";
}
