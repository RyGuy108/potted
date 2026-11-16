import { formatUsd } from "@potted/core";
import Link from "next/link";
import { checkAction, lockAction, simulateAction } from "@/app/actions";
import { ActionButton } from "@/components/ActionButton";
import { StatusPill } from "@/components/ChallengeCard";
import { ClaimForm } from "@/components/ClaimForm";
import { CreateChallengeForm } from "@/components/CreateChallengeForm";
import { AutoRefresh, CopyField, Countdown } from "@/components/Live";
import { SignInCard } from "@/components/SignInCard";
import { adapterStatus, gameOf } from "@/lib/format";
import { listChallenges, simulatedResultsAllowed } from "@/lib/service";
import { currentUser } from "@/lib/session";

export default async function Dashboard() {
  const user = await currentUser();
  if (user?.role !== "streamer") {
    return (
      <>
        <h1>Streamer dashboard</h1>
        <p className="lede">Sign in as the demo streamer to create challenges and run an attempt.</p>
        <SignInCard compact />
      </>
    );
  }
  const challenges = listChallenges(user.id);
  const rehearsal = simulatedResultsAllowed();

  return (
    <>
      <AutoRefresh pollIds={challenges.filter((c) => c.status === "locked").map((c) => c.id)} />
      <p className="eyebrow">Dashboard</p>
      <h1>Run your challenges</h1>

      <section className="card links">
        <CopyField label="Fan page (put this in chat)" value={`/s/${user.handle}`} />
        <CopyField label="Overlay (OBS browser source)" value={`/overlay/${user.handle}`} />
        <p className="muted small">
          Add <code>?bg=1</code> to preview the overlay on a dark background, or <code>?muted=1</code> to silence the announcer.
        </p>
      </section>

      <CreateChallengeForm warnings={adapterStatus()} />

      <h2>Your challenges</h2>
      {challenges.length === 0 && <p className="empty">Nothing yet. Create your first challenge above.</p>}
      <div className="list">
        {challenges.map((c) => (
          <section key={c.id} className="card manage">
            <div className="meta">
              <span className="tag">{gameOf(c).name}</span>
              <StatusPill challenge={c} />
              <span className="mono">{formatUsd(c.totalMicro)}</span>
              {(c.status === "open" || c.status === "locked") && (
                <span className="muted small">
                  <Countdown until={c.deadline} /> left
                </span>
              )}
            </div>
            <h3>
              <Link href={`/c/${c.id}`}>{c.title}</Link>
            </h3>

            {c.status === "open" && (
              <ActionButton action={lockAction.bind(null, c.id)} confirm="Close pledging and start the attempt?">
                Start attempt
              </ActionButton>
            )}

            {c.status === "locked" && (
              <>
                <p className="muted small">{c.verdict?.reason ?? "Waiting for a result"}</p>
                <div className="row">
                  <ActionButton action={checkAction.bind(null, c.id)} variant="ghost">
                    Check now
                  </ActionButton>
                  {rehearsal && (
                    <>
                      <ActionButton action={simulateAction.bind(null, c.id, true)} variant="ghost">
                        Rehearse a win
                      </ActionButton>
                      <ActionButton action={simulateAction.bind(null, c.id, false)} variant="ghost">
                        Rehearse a miss
                      </ActionButton>
                    </>
                  )}
                </div>
                {c.condition.kind === "optimistic" && !c.claim && <ClaimForm challengeId={c.id} />}
                {c.claim && <p className="muted small">Clip posted. It settles when the dispute window ends.</p>}
              </>
            )}

            {(c.status === "paid" || c.status === "failed") && <p className="muted small">{c.verdict?.reason}</p>}
          </section>
        ))}
      </div>
    </>
  );
}
