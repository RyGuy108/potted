import { type Challenge, formatUsd, growthOf } from "@potted/core";
import Link from "next/link";
import { STATUS_LABEL, gameOf, tierLabel } from "@/lib/format";
import { Countdown } from "./Live";
import { Beanstalk } from "./Beanstalk";

export function FundingBar({ challenge }: { challenge: Challenge }) {
  const growth = growthOf(challenge.totalMicro, challenge.goalMicro);
  return (
    <div className="funding">
      <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(growth.ratio * 100)}>
        <span style={{ width: `${growth.ratio * 100}%` }} />
      </div>
      <div className="funding-row">
        <strong className="mono">{formatUsd(challenge.totalMicro)}</strong>
        <span className="muted">in the pot · reaches the clouds at {formatUsd(challenge.goalMicro)}</span>
      </div>
    </div>
  );
}

export function StatusPill({ challenge }: { challenge: Challenge }) {
  return <span className={`pill pill-${challenge.status}`}>{STATUS_LABEL[challenge.status]}</span>;
}

export function ChallengeCard({ challenge }: { challenge: Challenge }) {
  const growth = growthOf(challenge.totalMicro, challenge.goalMicro);
  const live = challenge.status === "open" || challenge.status === "locked";
  return (
    <Link href={`/c/${challenge.id}`} className="card challenge-card">
      <Beanstalk stage={growth.index} size={72} />
      <div className="challenge-body">
        <div className="meta">
          <span className="tag">{gameOf(challenge).name}</span>
          <span className="tag tag-quiet">{tierLabel(challenge)}</span>
          <StatusPill challenge={challenge} />
        </div>
        <h3>{challenge.title}</h3>
        <FundingBar challenge={challenge} />
        {live && (
          <p className="muted small">
            {challenge.status === "open" ? "Pledging closes in " : "Time left: "}
            <Countdown until={challenge.deadline} />
          </p>
        )}
      </div>
    </Link>
  );
}
