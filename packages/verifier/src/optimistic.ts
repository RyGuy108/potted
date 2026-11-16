import type { OptimisticCondition, Verdict } from "@potted/core";
import { type Adapter, pending } from "./types";

/**
 * For games with no data source (GTA IV, cooking, anything). The streamer
 * claims success with a clip. If no funder disputes inside the window, the
 * claim stands. A dispute pauses settlement until a moderator rules.
 */
export const optimisticAdapter: Adapter<OptimisticCondition> = {
  kind: "optimistic",
  async check(c, ctx): Promise<Verdict> {
    const claim = ctx.claim;
    if (!claim) {
      return ctx.now > ctx.deadline
        ? { outcome: "failure", reason: "No claim was made before the deadline" }
        : pending("Waiting for the streamer to post a clip");
    }
    const evidence = {
      source: "clip",
      ref: claim.clipUrl,
      url: claim.clipUrl,
      summary: `Streamer's clip for "${c.statement}".`,
    };
    if (claim.ruling === "upheld") {
      return { outcome: "success", reason: "A moderator reviewed the dispute and upheld the claim", evidence };
    }
    if (claim.ruling === "rejected") {
      return { outcome: "failure", reason: "A moderator reviewed the dispute and rejected the claim", evidence };
    }
    if (claim.disputedBy.length > 0) {
      return pending(`Disputed by ${claim.disputedBy.length} funder(s); waiting for a moderator`);
    }
    const settlesAt = claim.claimedAt + c.disputeWindowSecs * 1000;
    if (ctx.now >= settlesAt) {
      return { outcome: "success", reason: "No funder disputed the clip in time", evidence };
    }
    return pending(`Dispute window open for ${Math.ceil((settlesAt - ctx.now) / 1000)}s`);
  },
};
