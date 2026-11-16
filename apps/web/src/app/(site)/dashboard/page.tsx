import { draftTerms } from "@potted/coordinator";
import { GAMES, formatUsd } from "@potted/core";
import Link from "next/link";
import { cancelAction, checkAction, recapAction, respondInviteAction, withdrawInviteAction, dismissSuggestionAction, lockAction, runAgainAction, simulateAction } from "@/app/actions";
import { ActionButton } from "@/components/ActionButton";
import { StatusPill } from "@/components/ChallengeCard";
import { ClaimForm } from "@/components/ClaimForm";
import { CreateChallengeForm } from "@/components/CreateChallengeForm";
import { AutoRefresh, CopyField, Countdown } from "@/components/Live";
import { SettingsForm } from "@/components/SettingsForm";
import { SignInCard } from "@/components/SignInCard";
import { adapterStatus, gameOf } from "@/lib/format";
import { getSuggestion, getUser, invitesFor, listChallenges, listStreamers, pendingSuggestions, settingsOf, shareOf, simulatedResultsAllowed, stageChallenges } from "@/lib/service";
import { currentUser } from "@/lib/session";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ use?: string }> }) {
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
  const suggestions = pendingSuggestions(user.id);
  const { use } = await searchParams;
  const picked = use ? getSuggestion(use) : undefined;
  const seed = picked && picked.streamerId === user.id && picked.status === "pending" ? picked : undefined;
  const invites = invitesFor(user);
  const guesting = stageChallenges(user.id).filter((c) => c.streamerId !== user.id);
  const partners = listStreamers().filter((s) => s.id !== user.id).map((s) => ({ handle: s.handle!, name: s.name }));
  const draft = seed ? await draftTerms({ gameId: seed.gameId, text: seed.text }) : undefined;

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

      {suggestions.length > 0 && (
        <section className="card manage">
          <h3>Ideas from fans</h3>
          {suggestions.map((s) => (
            <div key={s.id} className="suggestion">
              <div>
                <p>{s.text}</p>
                <p className="muted small">
                  {s.fanName} · {GAMES.find((g) => g.id === s.gameId)?.name}
                </p>
              </div>
              <div className="row">
                <Link href={`/dashboard?use=${s.id}#new`} className="btn btn-primary">
                  Use this
                </Link>
                <ActionButton action={dismissSuggestionAction.bind(null, s.id)} variant="ghost">
                  Dismiss
                </ActionButton>
              </div>
            </div>
          ))}
        </section>
      )}

      {(invites.incoming.length > 0 || invites.outgoing.length > 0) && (
        <section className="card manage">
          <h3>Collab invites</h3>
          {invites.incoming.map((i) => (
            <div key={i.id} className="suggestion">
              <div>
                <p>{i.title}</p>
                <p className="muted small">
                  From {getUser(i.hostId)?.name}. You get {i.guestPct}% of the pot if it is completed · goal {formatUsd(i.input.goalUsd * 1_000_000)} ·{" "}
                  {i.input.minutes} minutes once you accept
                </p>
              </div>
              <div className="row">
                <ActionButton action={respondInviteAction.bind(null, i.id, true)}>Accept and open</ActionButton>
                <ActionButton action={respondInviteAction.bind(null, i.id, false)} variant="ghost">
                  Decline
                </ActionButton>
              </div>
            </div>
          ))}
          {invites.outgoing.map((i) => (
            <div key={i.id} className="suggestion">
              <div>
                <p>{i.title}</p>
                <p className="muted small">
                  Waiting for {getUser(i.guestId)?.name} · their share {i.guestPct}%
                </p>
              </div>
              <ActionButton action={withdrawInviteAction.bind(null, i.id)} variant="ghost">
                Withdraw
              </ActionButton>
            </div>
          ))}
        </section>
      )}

      {guesting.length > 0 && (
        <section className="card manage">
          <h3>Collabs you are a guest on</h3>
          {guesting.map((c) => (
            <div key={c.id} className="suggestion">
              <div>
                <p>
                  <Link href={`/c/${c.id}`}>{c.title}</Link>
                </p>
                <p className="muted small">
                  Hosted by {getUser(c.streamerId)?.name} · your share of the current pot: <span className="mono">{formatUsd(shareOf(c, user.id))}</span>
                </p>
              </div>
              <StatusPill challenge={c} />
            </div>
          ))}
        </section>
      )}

      <div id="new">
        <CreateChallengeForm key={seed?.id ?? "blank"} warnings={adapterStatus()} suggestion={seed} draft={draft} partners={partners} />
      </div>

      <SettingsForm initial={settingsOf(user)} />

      <div className="row between">
        <h2>Your challenges</h2>
        {challenges.length > 0 && (
          <ActionButton action={recapAction} variant="ghost">
            Read stream recap
          </ActionButton>
        )}
      </div>
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
              <div className="row">
                <ActionButton action={lockAction.bind(null, c.id)} confirm="Close pledging and start the attempt?">
                  Start attempt
                </ActionButton>
                <ActionButton action={cancelAction.bind(null, c.id)} variant="danger" confirm="Cancel this challenge and refund every fan?">
                  Cancel and refund
                </ActionButton>
              </div>
            )}

            {c.status === "locked" && (
              <>
                <p className="muted small">{c.verdict?.reason ?? "Waiting for a result"}</p>
                <div className="row">
                  <ActionButton action={checkAction.bind(null, c.id)} variant="ghost">
                    Check now
                  </ActionButton>
                  <ActionButton action={cancelAction.bind(null, c.id)} variant="danger" confirm="Give up on this attempt and refund every fan?">
                    Give up and refund
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

            {(c.status === "paid" || c.status === "failed") && (
              <>
                <p className="muted small">{c.verdict?.reason}</p>
                <ActionButton action={runAgainAction.bind(null, c.id)} variant="ghost">
                  Run it again
                </ActionButton>
              </>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
