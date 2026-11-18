import { formatUsd } from "@potted/core";
import { gameOf } from "@/lib/format";
import { backersOf, bountyTotal } from "@/lib/service";
import type { Bounty } from "@/lib/store";
import { BackBountyButtons } from "./BountyForms";
import { Countdown } from "./Live";

/** Open fan requests (bounties) on a stream, as planters see them. */
export function BountyBoard({ bounties, canBack, minUsd }: { bounties: Bounty[]; canBack: boolean; minUsd: number }) {
  return (
    <div className="bounties">
      {bounties.map((b) => {
        const backers = backersOf(b.id);
        return (
          <article key={b.id} className="card bounty">
            <div className="meta">
              <span className="tag">Fan request</span>
              <span className="tag">{b.customGame ?? gameOf({ gameId: b.gameId }).name}</span>
              <span className="muted small">
                Closes in <Countdown until={b.expiresAt} />
              </span>
            </div>
            <h3>{b.text}</h3>
            <p className="bounty-pot">
              <span className="mono">{formatUsd(bountyTotal(b.id))}</span>
              <span className="muted small">
                from {backers.length} {backers.length === 1 ? "planter" : "planters"} · asked by {backers.find((x) => x.userId === b.creatorId)?.name ?? "a planter"}
              </span>
            </p>
            <p className="muted small">Paid when the climber takes it on and starts. Refunded if they pass or never start.</p>
            {canBack && <BackBountyButtons bountyId={b.id} minUsd={minUsd} />}
          </article>
        );
      })}
    </div>
  );
}
