import { draftTerms, usesGrok } from "@potted/coordinator";
import { GAMES, formatUsd } from "@potted/core";
import Link from "next/link";
import { cancelAction, checkAction, declineBountyAction, recapAction, respondInviteAction, withdrawInviteAction, dismissSuggestionAction, lockAction, runAgainAction, simulateAction } from "@/app/actions";
import { ActionButton } from "@/components/ActionButton";
import { SplitLine, StatusPill } from "@/components/ChallengeCard";
import type { SuggestionSeed } from "@/components/CreateChallengeForm";
import { GameArt } from "@/components/GameArt";
import { ClaimForm } from "@/components/ClaimForm";
import { CreateChallengeForm } from "@/components/CreateChallengeForm";
import { AutoRefresh, CopyField, Countdown } from "@/components/Live";
import { Wallet } from "@/components/Wallet";
import { SettingsForm } from "@/components/SettingsForm";
import { adapterStatus, gameOf } from "@/lib/format";
import { backersOf, bountiesSupported, bountyTotal, challengeStats, expireBounties, openBounties, getSuggestion, getUser, invitesFor, listChallenges, listStreamers, pendingSuggestions, settingsOf, shareOf, simulatedResultsAllowed, stageChallenges } from "@/lib/service";
import { currentUser } from "@/lib/session";
import { pitchFields, scoutOf } from "@/lib/scout";
import { publicBase } from "@/lib/url";
import { ScoutPanel } from "@/components/ScoutPanel";
import { PointsPanel } from "@/components/PointsPanel";
import { pointsConfig, redemptionsFor } from "@/lib/points";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ use?: string; bounty?: string; pitch?: string }> }) {
  const user = await currentUser();
  if (user?.role !== "streamer") {
    return (
      <div className="login">
        <h1>Climber dashboard</h1>
        {user ? (
          <>
            <p className="lede">This page is for climbers. Your account is for {user.role === "mod" ? "reviewing disputed clips" : "backing challenges"}.</p>
            <Link href={user.role === "mod" ? "/reviews" : "/"} className="btn btn-primary">
              {user.role === "mod" ? "Go to reviews" : "Go to my home"}
            </Link>
          </>
        ) : (
          <>
            <p className="lede">Log in to your climber account to open challenges and run attempts.</p>
            <div className="row">
              <Link href="/login" className="btn btn-primary">
                Log in
              </Link>
              <Link href="/signup/climber" className="btn btn-ghost">
                Sign up as a climber
              </Link>
            </div>
          </>
        )}
      </div>
    );
  }
  const challenges = listChallenges(user.id);
  const rehearsal = simulatedResultsAllowed();
  const suggestions = pendingSuggestions(user.id);
  const { use, bounty: bountyParam, pitch: pitchParam } = await searchParams;
  const scoutRun = scoutOf(user.id);
  const pickedPitch = pitchParam !== undefined ? scoutRun?.pitches[Number(pitchParam)] : undefined;
  await expireBounties();
  const bounties = bountiesSupported() ? openBounties(user.id) : [];
  const picked = use ? getSuggestion(use) : undefined;
  const pickedBounty = bountyParam ? bounties.find((b) => b.id === bountyParam) : undefined;
  const seed: SuggestionSeed | undefined = pickedBounty
    ? {
        kind: "bounty",
        id: pickedBounty.id,
        fanName: getUser(pickedBounty.creatorId)?.name ?? "a planter",
        gameId: pickedBounty.gameId,
        text: pickedBounty.text,
        ...(pickedBounty.customGame ? { customGame: pickedBounty.customGame } : {}),
        heldMicro: bountyTotal(pickedBounty.id),
      }
    : picked && picked.streamerId === user.id && picked.status === "pending"
      ? picked
      : undefined;
  const past = challenges.filter((c) => c.status === "paid" || c.status === "failed");
  const invites = invitesFor(user);
  const guesting = stageChallenges(user.id).filter((c) => c.streamerId !== user.id);
  const partners = listStreamers().filter((s) => s.id !== user.id).map((s) => ({ handle: s.handle!, name: s.name }));
  const draft = pickedPitch
    ? { gameId: pickedPitch.gameId, fields: pitchFields(user, pickedPitch), note: `From the scout: ${pickedPitch.why}`, source: scoutRun!.source }
    : seed
      ? await draftTerms({ gameId: seed.gameId, text: seed.text })
      : undefined;
  const fanPage = `${await publicBase()}/s/${user.handle}`;

  return (
    <>
      <AutoRefresh pollIds={challenges.filter((c) => c.status === "locked").map((c) => c.id)} />
      <div className="row between">
        <p className="eyebrow">Dashboard</p>
        <Wallet user={user} />
      </div>
      <h1>Run your challenges</h1>

      <section className="card links">
        <CopyField label="Fan page (put this in chat)" value={`/s/${user.handle}`} />
        <CopyField label="Overlay (OBS browser source)" value={`/overlay/${user.handle}`} />
        <p className="muted small">
          Add <code>?bg=1</code> to preview the overlay on a dark background, or <code>?muted=1</code> to silence the announcer.
        </p>
      </section>

      <ScoutPanel run={scoutRun} settings={settingsOf(user)} fanPage={fanPage} grok={usesGrok()} />

      <PointsPanel config={pointsConfig(user.id)} redemptions={redemptionsFor(user.id)} />

      {bounties.length > 0 && (
        <section className="card manage">
          <h3>Bounties waiting for you</h3>
          <p className="muted small">Planters put this money on ideas. Take one on and it opens as a challenge with the money already in the pot. Decline and they get it back.</p>
          {bounties.map((b) => {
            const backers = backersOf(b.id);
            return (
              <div key={b.id} className="suggestion">
                <div>
                  <p>{b.text}</p>
                  <p className="muted small">
                    <span className="mono">{formatUsd(bountyTotal(b.id))}</span> from {backers.length} {backers.length === 1 ? "planter" : "planters"} ·{" "}
                    {b.customGame ?? GAMES.find((g) => g.id === b.gameId)?.name} · closes in <Countdown until={b.expiresAt} />
                  </p>
                </div>
                <div className="row">
                  <Link href={`/dashboard?bounty=${b.id}#new`} className="btn btn-primary">
                    Take it on
                  </Link>
                  <ActionButton action={declineBountyAction.bind(null, b.id)} variant="ghost" confirm="Decline this bounty and refund everyone who backed it?">
                    Decline
                  </ActionButton>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {suggestions.length > 0 && (
        <section className="card manage">
          <h3>Ideas from fans</h3>
          {suggestions.map((s) => (
            <div key={s.id} className="suggestion">
              <div>
                <p>{s.text}</p>
                <p className="muted small">
                  {s.fanName} · {s.customGame ?? GAMES.find((g) => g.id === s.gameId)?.name}
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
                  {i.input.upfrontPct ? ` · ${i.input.upfrontPct}% paid when the attempt starts` : ""}
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
        <CreateChallengeForm key={seed?.id ?? (pickedPitch ? `pitch-${pitchParam}-${scoutRun?.at}` : "blank")} warnings={adapterStatus()} suggestion={seed} draft={draft} partners={partners} />
      </div>

      <SettingsForm initial={settingsOf(user)} bounties={bountiesSupported()} />

      <div className="row between">
        <h2>Your challenges</h2>
        {challenges.length > 0 && (
          <ActionButton action={recapAction} variant="ghost">
            Read stream recap
          </ActionButton>
        )}
      </div>
      {challenges.length === 0 && <p className="empty">Nothing yet. Create your first challenge above.</p>}
      {challenges.length > 0 && past.length === challenges.length && <p className="empty">Nothing live. Open a challenge above, or rerun one below.</p>}
      <div className="list">
        {challenges.filter((c) => c.status === "open" || c.status === "locked").map((c) => (
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

          </section>
        ))}
      </div>

      {past.length > 0 && (
        <>
          <h2>Previous challenges</h2>
          <div className="past-grid">
            {past.map((c) => {
              const stats = challengeStats(c, user.id);
              const paid = c.status === "paid";
              return (
                <article key={c.id} className="card past-tile">
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
                        <dd className="mono">{stats.pctOfGoal}%</dd>
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
            })}
          </div>
        </>
      )}
    </>
  );
}
