import { type Challenge, formatUsd } from "@potted/core";
import Link from "next/link";
import { runAgainAction } from "@/app/actions";
import { gameOf } from "@/lib/format";
import { challengeStats } from "@/lib/service";
import { ActionButton } from "./ActionButton";
import { SplitLine } from "./ChallengeCard";
import { GameArt } from "./GameArt";

/** A settled challenge with its numbers and a button to run it again. */
export function PastTile({ challenge: c, userId }: { challenge: Challenge; userId: string }) {
  const stats = challengeStats(c, userId);
  const paid = c.status === "paid";
  return (
    <article className="card past-tile">
      <div className="past-art">
        <GameArt id={c.gameId} name={gameOf(c).name} />
        <span className={paid ? "past-result past-paid" : "past-result"}>{paid ? "Completed" : "Refunded"}</span>
      </div>
      <div className="past-body">
        <span className="tag">{gameOf(c).name}</span>
        <h3>
          <Link href={`/c/${c.id}`}>{c.title}</Link>
        </h3>
        <p className="muted small">{c.verdict?.reason}</p>
        <dl className="past-stats">
          <div>
            <dt>Pot</dt>
            <dd className="mono">{formatUsd(c.totalMicro)}</dd>
          </div>
          <div>
            <dt>Of goal</dt>
            <dd className="mono">{stats.pctOfGoal === null ? "open pot" : `${stats.pctOfGoal}%`}</dd>
          </div>
          <div>
            <dt>Planters</dt>
            <dd className="mono">{stats.planters}</dd>
          </div>
          <div>
            <dt>You earned</dt>
            <dd className="mono">{formatUsd(paid ? stats.shareMicro : 0)}</dd>
          </div>
          <div>
            <dt>Biggest pledge</dt>
            <dd className="mono">{formatUsd(stats.biggestMicro)}</dd>
          </div>
          <div>
            <dt>Ran for</dt>
            <dd className="mono">{stats.minutes} min</dd>
          </div>
        </dl>
        <SplitLine challenge={c} />
        <ActionButton action={runAgainAction.bind(null, c.id)} variant="ghost">
          Run it again
        </ActionButton>
      </div>
    </article>
  );
}
