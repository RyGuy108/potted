import { Fragment } from "react";
import { type Brief, disputeBrief } from "@potted/coordinator";
import { type Challenge, formatUsd, growthOf, splitPot, toUsd } from "@potted/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { checkAction, disputeAction, ruleAction } from "@/app/actions";
import { ActionButton } from "@/components/ActionButton";
import { FundingBar, SplitLine, StatusPill, UpfrontLine } from "@/components/ChallengeCard";
import { AutoRefresh, CopyField, Countdown } from "@/components/Live";
import { Beanstalk } from "@/components/Beanstalk";
import { PledgeForm } from "@/components/PledgeForm";
import { Wallet } from "@/components/Wallet";
import { SignInPanel } from "@/components/SignInPanel";
import { clock, gameOf, tierLabel } from "@/lib/format";
import { explorerTxUrl, isSimTx } from "@/lib/ledger";
import * as service from "@/lib/service";
import { currentUser } from "@/lib/session";

function rulesFor(challenge: Challenge): string[] {
  const c = challenge.condition;
  switch (c.kind) {
    case "lichess":
      return [
        "Only the first rated game started after the attempt begins counts.",
        "The game must be paired by Lichess matchmaking. Direct challenges from friends are ignored.",
        `Games shorter than ${c.minPlies} half-moves and aborted games are ignored. A draw is not a win.`,
        ...(c.minOpponentRating ? [`The opponent must be rated ${c.minOpponentRating} or higher.`] : []),
      ];
    case "brawlstars":
      return [
        `The first ${c.battles} battles after the attempt begins are counted, from the official battle log.`,
        "Friendly battles are ignored. In Showdown, top 4 solo or top 2 duo counts as a win.",
      ];
    case "fortnite":
      return [
        "Totals are read from public player stats when the attempt begins and compared until the deadline.",
        "The public data has no per-match detail, so this check cannot tell which match a win came from.",
      ];
    case "steam":
      return [
        "Steam records the moment each achievement is unlocked. That timestamp must fall between the start of the attempt and the deadline.",
        "If the achievement was already unlocked when the attempt began, the challenge fails and everyone is refunded.",
      ];
    case "optimistic":
      return [
        "The streamer posts a clip of the challenge being completed.",
        ...(c.proof ? [`The clip must show: ${c.proof}`] : []),
        `Anyone who funded it has ${c.disputeWindowSecs} seconds to dispute. With no dispute, the pot pays out.`,
        "A dispute holds the pot until a moderator reviews the clip.",
      ];
  }
}

/** One brief per disputed challenge, so page refreshes do not call Grok again. */
const briefs = new Map<string, Promise<Brief>>();

function briefFor(challenge: Challenge, funders: number): Promise<Brief> | undefined {
  const c = challenge.condition;
  if (c.kind !== "optimistic" || !challenge.claim) return undefined;
  let brief = briefs.get(challenge.id);
  if (!brief) {
    brief = disputeBrief({
      title: challenge.title,
      statement: c.proof ? `${c.statement} (the clip must show: ${c.proof})` : c.statement,
      game: c.game,
      disputes: challenge.claim.disputedBy.length,
      funders,
    });
    briefs.set(challenge.id, brief);
    if (briefs.size > 100) briefs.delete(briefs.keys().next().value!);
  }
  return brief;
}

function Receipt({ challenge, hostName }: { challenge: Challenge; hostName: string }) {
  const verdict = challenge.verdict;
  if (!verdict || verdict.outcome === "pending") return null;
  const evidence = verdict.evidence;
  const paid = challenge.status === "paid";
  return (
    <section className={`card receipt ${paid ? "receipt-paid" : "receipt-failed"}`}>
      <p className="eyebrow">Receipt</p>
      <h3>
        {paid
          ? `${formatUsd(challenge.totalMicro)} paid out`
          : challenge.upfrontPaidMicro
            ? `${formatUsd(challenge.upfrontPaidMicro)} was paid up front; the rest went back to fans`
            : "Every pledge was refunded"}
      </h3>
      {paid && (
        <dl>
          <dt>{hostName}</dt>
          <dd className="mono">{formatUsd(splitPot(challenge.totalMicro, challenge.splits).hostMicro)}</dd>
          {(challenge.splits ?? []).map((s, i) => (
            <Fragment key={`${s.kind}:${s.name}`}>
              <dt>{s.name}</dt>
              <dd className="mono">{formatUsd(splitPot(challenge.totalMicro, challenge.splits).parts[i]!)}</dd>
            </Fragment>
          ))}
        </dl>
      )}
      {evidence?.simulated && <p className="warn">Rehearsal result. No game data was checked for this settlement.</p>}
      <p>{verdict.reason}.</p>
      {evidence && (
        <dl>
          <dt>Evidence</dt>
          <dd>{evidence.summary}</dd>
          <dt>Reference</dt>
          <dd className="mono">
            {evidence.url ? (
              <a href={evidence.url} target="_blank" rel="noreferrer">
                {evidence.source}:{evidence.source === "clip" ? "open clip" : evidence.ref}
              </a>
            ) : (
              `${evidence.source}:${evidence.ref}`
            )}
          </dd>
        </dl>
      )}
      <dl>
        <dt>Settled</dt>
        <dd>{challenge.settledAt ? clock(challenge.settledAt) : "–"}</dd>
        <dt>Transaction</dt>
        <dd className="mono">
          {challenge.txs.settle && !isSimTx(challenge.txs.settle) ? (
            <a href={explorerTxUrl(challenge.txs.settle)} target="_blank" rel="noreferrer">
              {challenge.txs.settle.slice(0, 8)}…{challenge.txs.settle.slice(-8)} on Solana Explorer
            </a>
          ) : (
            (challenge.txs.settle ?? "–")
          )}
          {isSimTx(challenge.txs.settle) && <span className="tag tag-quiet">simulated ledger</span>}
        </dd>
      </dl>
    </section>
  );
}

export default async function ChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let challenge: Challenge;
  try {
    challenge = service.getChallenge(id);
  } catch {
    notFound();
  }
  const user = await currentUser();
  const streamer = service.getUser(challenge.streamerId);
  const funders = service.fundersOf(challenge.id);
  const mine = funders.find((f) => f.userId === user?.id)?.amountMicro ?? 0;
  const growth = growthOf(challenge.totalMicro, challenge.goalMicro);
  const live = challenge.status === "open" || challenge.status === "locked";
  const claim = challenge.claim;
  const disputed = (claim?.disputedBy.length ?? 0) > 0;
  const ruling = user?.role === "mod" && disputed && !claim?.ruling;
  const brief = ruling ? await briefFor(challenge, funders.length) : undefined;

  return (
    <>
      {live && <AutoRefresh pollIds={challenge.status === "locked" ? [challenge.id] : []} />}
      <p className="crumbs small">
        <Link href={`/s/${streamer?.handle ?? ""}`}>← {streamer?.name}&apos;s challenges</Link>
      </p>

      <section className="card detail">
        <Beanstalk stage={growth.index} size={132} />
        <div className="detail-body">
          <div className="meta">
            <span className="tag">{gameOf(challenge).name}</span>
            <span className="tag tag-quiet">{tierLabel(challenge)}</span>
            <StatusPill challenge={challenge} />
          </div>
          <h1>{challenge.title}</h1>
          <SplitLine challenge={challenge} />
          <UpfrontLine challenge={challenge} name={streamer?.name} />
          <FundingBar challenge={challenge} />
          {live && (
            <p className="muted">
              {challenge.status === "open" ? "Pledging closes in " : "Time left to finish: "}
              <Countdown until={challenge.deadline} /> · up to {formatUsd(challenge.pledgeCapMicro)} per fan
            </p>
          )}

          {challenge.status === "open" && !user && <SignInPanel />}
          {challenge.status === "open" && user?.role === "fan" && (
            <>
              <Wallet user={user} />
              <PledgeForm challengeId={challenge.id} remainingUsd={toUsd(challenge.pledgeCapMicro - mine)} upfrontPct={challenge.upfrontPct} />
              {mine > 0 && <p className="muted small">You have {formatUsd(mine)} in this pot.</p>}
            </>
          )}
          {user?.id === challenge.streamerId && live && (
            <p className="muted small">
              This is your challenge. Manage it from the <Link href="/dashboard">dashboard</Link>.
            </p>
          )}

          {challenge.status === "locked" && (
            <div className="waiting">
              <span className="dot" aria-hidden="true" />
              <span>{challenge.verdict?.reason ?? "Waiting for a result"}</span>
              <ActionButton action={checkAction.bind(null, challenge.id)} variant="ghost">
                Check now
              </ActionButton>
            </div>
          )}

          {challenge.status === "locked" && claim && (
            <div className="claim">
              <p>
                <a href={claim.clipUrl} target="_blank" rel="noreferrer">
                  Watch the streamer&apos;s clip
                </a>
                {disputed ? " · disputed, waiting for a moderator" : " · pays out when the dispute window ends"}
              </p>
              {user && mine > 0 && !claim.disputedBy.includes(user.id) && !claim.ruling && (
                <ActionButton action={disputeAction.bind(null, challenge.id)} variant="danger">
                  Dispute this clip
                </ActionButton>
              )}
              {brief && (
                <div className="brief">
                  <p className="eyebrow">
                    Before you rule <span className="tag tag-quiet">{brief.source === "grok" ? "Checklist by Grok" : "Standard checklist"}</span>
                  </p>
                  <ul className="rules">
                    {brief.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                  <p className="muted small">This is a checklist, not a verdict. The ruling is yours.</p>
                </div>
              )}
              {ruling && (
                <div className="row">
                  <ActionButton action={ruleAction.bind(null, challenge.id, true)}>Uphold: pay the streamer</ActionButton>
                  <ActionButton action={ruleAction.bind(null, challenge.id, false)} variant="danger">
                    Reject: refund fans
                  </ActionButton>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <Receipt challenge={challenge} hostName={streamer?.name ?? "Streamer"} />

      <section className="card share">
        <CopyField label="Share this challenge" value={`/c/${challenge.id}`} />
        <p className="muted small">The link unfurls as a card with the beanstalk, the pot and the result.</p>
      </section>

      <div className="two-col">
        <section className="card">
          <h3>How the result is decided</h3>
          <p className="muted">{gameOf(challenge).how}</p>
          <ul className="rules">
            {rulesFor(challenge).map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
            <li>
              If no result arrives by {clock(challenge.settleBy)}, {challenge.upfrontPct ? `the ${100 - challenge.upfrontPct}% not paid up front is` : "every pledge is"}{" "}
              refunded automatically.
            </li>
          </ul>
        </section>

        <section className="card">
          <h3>Funders</h3>
          {funders.length === 0 ? (
            <p className="empty">Nobody has pledged yet. The first pledge plants the bean.</p>
          ) : (
            <ul className="funders">
              {funders.map((p) => (
                <li key={p.userId}>
                  <span>{p.fanName}</span>
                  <span className="mono">
                    {formatUsd(p.amountMicro)}
                    {p.refunded && <span className="tag tag-quiet">refunded</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
