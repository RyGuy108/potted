import { type Challenge, formatUsd, growthOf } from "@potted/core";
import Link from "next/link";
import { STATUS_LABEL, gameOf, tierLabel } from "@/lib/format";
import { Countdown } from "./Live";
import { Beanstalk } from "./Beanstalk";
import { CountUp, GrowBar } from "./Motion";

export function FundingBar({ challenge }: { challenge: Challenge }) {
  const growth = growthOf(challenge.totalMicro, challenge.goalMicro);
  return (
    <div className="funding">
      <GrowBar pct={growth.ratio * 100} label="Pot toward its goal" />
      <div className="funding-row">
        <strong className="mono money-up">
          <CountUp value={challenge.totalMicro} micro format="usd" />
        </strong>
        <span className="muted">in the pot · reaches the clouds at {formatUsd(challenge.goalMicro)}</span>
      </div>
    </div>
  );
}

export function StatusPill({ challenge }: { challenge: Challenge }) {
  return <span className={`pill pill-${challenge.status}`}>{STATUS_LABEL[challenge.status]}</span>;
}

/** Says who else is paid from a successful pot. Renders nothing for a solo challenge. */
export function SplitLine({ challenge }: { challenge: Challenge }) {
  const splits = challenge.splits ?? [];
  if (splits.length === 0) return null;
  const host = 100 - splits.reduce((sum, s) => sum + s.pct, 0);
  return (
    <p className="split-line small">
      {splits.map((s) => (
        <span key={`${s.kind}:${s.name}`} className={`tag tag-${s.kind}`}>
          {s.kind === "guest" ? `Collab with ${s.name}` : `For ${s.name}`} · {s.pct}%
        </span>
      ))}
      <span className="muted">host keeps {host}%</span>
    </p>
  );
}

/** Says how much of the pot goes to the streamer at the start, and what that means for a miss. */
export function UpfrontLine({ challenge, name }: { challenge: Challenge; name?: string }) {
  const pct = challenge.upfrontPct ?? 0;
  if (pct === 0) return null;
  const who = name ?? "the climber";
  return (
    <p className="upfront-line small">
      <span className="tag tag-upfront">{pct}% up front</span>
      {challenge.upfrontPaidMicro !== undefined ? (
        <span className="muted">
          {formatUsd(challenge.upfrontPaidMicro)} went to {who} when the attempt started. The rest pays out only on completion; a miss returns it to
          fans.
        </span>
      ) : (
        <span className="muted">
          {pct}% of the pot goes to {who} when the attempt starts. The other {100 - pct}% pays out only if it is completed; on a miss you get that part back.
        </span>
      )}
    </p>
  );
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
        <SplitLine challenge={challenge} />
        <UpfrontLine challenge={challenge} />
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
