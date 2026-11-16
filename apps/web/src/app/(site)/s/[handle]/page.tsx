import { notFound } from "next/navigation";
import { ChallengeCard } from "@/components/ChallengeCard";
import { AutoRefresh } from "@/components/Live";
import { SignInPanel } from "@/components/SignInPanel";
import { SuggestForm } from "@/components/SuggestForm";
import { formatUsd } from "@potted/core";
import { getStreamer, raisedFor, settingsOf, stageChallenges, topPlanters } from "@/lib/service";
import { currentUser } from "@/lib/session";

export default async function StreamerPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const streamer = getStreamer(handle);
  if (!streamer) notFound();
  const user = await currentUser();
  const challenges = stageChallenges(streamer.id);
  const live = challenges.filter((c) => c.status === "open" || c.status === "locked");
  const past = challenges.filter((c) => c.status === "paid" || c.status === "failed");

  const planters = topPlanters(streamer.id);
  const cause = settingsOf(streamer);
  const raised = raisedFor(streamer, cause.causeName);
  return (
    <>
      <AutoRefresh pollIds={live.filter((c) => c.status === "locked").map((c) => c.id)} />
      <p className="eyebrow">Stream</p>
      <h1>{streamer.name}&apos;s challenges</h1>
      <p className="lede">Pick a challenge and add to its pot. If {streamer.name} misses it, you get every cent back.</p>

      {cause.causeOn && (
        <section className="card cause-banner">
          <p className="eyebrow">Charity stream</p>
          <h3>
            {cause.causePct}% of every completed pot goes to{" "}
            {cause.causeUrl ? (
              <a href={cause.causeUrl} target="_blank" rel="noreferrer">
                {cause.causeName}
              </a>
            ) : (
              cause.causeName
            )}
          </h3>
          <p>
            <strong className="mono">{formatUsd(raised.raisedMicro)}</strong> raised so far
            {raised.inPlayMicro > 0 && (
              <>
                {" · "}
                <span className="mono">{formatUsd(raised.inPlayMicro)}</span> more if the live challenges are completed
              </>
            )}
          </p>
          <p className="muted small">The cause is named by {streamer.name}. This prototype does not verify charities.</p>
        </section>
      )}

      {!user && <SignInPanel />}

      <h2>Live now</h2>
      {live.length === 0 ? (
        <p className="empty">No open challenges right now. New ones show up here the moment {streamer.name} posts them.</p>
      ) : (
        <div className="list">
          {live.map((c) => (
            <ChallengeCard key={c.id} challenge={c} />
          ))}
        </div>
      )}

      {user?.role === "fan" && streamer.handle && settingsOf(streamer).acceptingSuggestions && (
        <>
          <h2>Got an idea?</h2>
          <SuggestForm handle={streamer.handle} streamerName={streamer.name} />
        </>
      )}

      {planters.length > 0 && (
        <>
          <h2>Top planters</h2>
          <ol className="card leaderboard">
            {planters.map((p, i) => (
              <li key={p.userId} className={p.userId === user?.id ? "me" : undefined}>
                <span className="mono rank">{i + 1}</span>
                <span>{p.name}</span>
                <span className="muted small">
                  {p.challenges} {p.challenges === 1 ? "challenge" : "challenges"}
                </span>
                <span className="mono">{formatUsd(p.amountMicro)}</span>
              </li>
            ))}
          </ol>
        </>
      )}

      {past.length > 0 && (
        <>
          <h2>Settled</h2>
          <div className="list">
            {past.map((c) => (
              <ChallengeCard key={c.id} challenge={c} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
