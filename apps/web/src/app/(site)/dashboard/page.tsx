import { draftTerms, usesGrok } from "@potted/coordinator";
import { GAMES, formatUsd } from "@potted/core";
import Link from "next/link";
import { cancelAction, checkAction, declineBountyAction, recapAction, respondInviteAction, withdrawInviteAction, dismissSuggestionAction, lockAction, simulateAction } from "@/app/actions";
import { ActionButton } from "@/components/ActionButton";
import { StatusPill } from "@/components/ChallengeCard";
import { ClaimForm } from "@/components/ClaimForm";
import { CreateChallengeForm, type SuggestionSeed } from "@/components/CreateChallengeForm";
import { DashHead, NotAClimber } from "@/components/DashHead";
import { AutoRefresh, Countdown } from "@/components/Live";
import { PastTile } from "@/components/PastTile";
import { ScoutPanel } from "@/components/ScoutPanel";
import { ApprovalQueue } from "@/components/StreamerPanels";
import { adapterStatus, gameOf } from "@/lib/format";
import { pointsConfig, redemptionsFor } from "@/lib/points";
import { pitchFields, scoutOf } from "@/lib/scout";
import { backersOf, bountiesSupported, bountyTotal, expireBounties, getSuggestion, getUser, invitesFor, listChallenges, listStreamers, openBounties, pendingSuggestions, settingsOf, shareOf, simulatedResultsAllowed, stageChallenges } from "@/lib/service";
import { currentUser } from "@/lib/session";
import { publicBase } from "@/lib/url";

/** The climber's Challenges page: running challenges, everything waiting on them, a new challenge, and past ones to run again. Setup, money and rewards are on /dashboard/channel. */
export default async function Dashboard({ searchParams }: { searchParams: Promise<{ use?: string; bounty?: string; pitch?: string }> }) {
  const user = await currentUser();
  if (user?.role !== "streamer") return <NotAClimber user={user} />;
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
  const live = challenges.filter((c) => c.status === "open" || c.status === "locked");
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
  const redemptions = redemptionsFor(user.id);

  return (
    <>
      <AutoRefresh pollIds={challenges.filter((c) => c.status === "locked").map((c) => c.id)} />
      <DashHead user={user} label="Challenges" title="Run your challenges" lede="What's running, what's waiting on you, a new challenge, and past ones to run again." />

      <div className="dash-stack">
        <ApprovalQueue
          items={[
            { label: ["fan idea to review", "fan ideas to review"], count: suggestions.length, href: "#ideas" },
            { label: ["funded request", "funded requests"], count: bounties.length, href: "#bounties" },
            { label: ["invite to collab", "invites to collab"], count: invites.incoming.length, href: "#invites" },
            { label: ["reward redemption to fulfil", "reward redemptions to fulfil"], count: redemptions.filter((r) => r.status === "pending").length, href: "/dashboard/channel#points" },
            { label: ["scout pitch not opened yet", "scout pitches not opened yet"], count: scoutRun ? scoutRun.pitches.filter((_, i) => !scoutRun.opened[i]).length : 0, href: "#scout" },
          ]}
        />

        <section className="dash-live">
      <div className="row between">
        <h2>Your challenges</h2>
        {challenges.length > 0 && (
          <ActionButton action={recapAction} variant="ghost">
            Read stream recap
          </ActionButton>
        )}
      </div>
      {challenges.length === 0 && <p className="empty">Nothing yet. Create your first challenge below.</p>}
      {challenges.length > 0 && past.length === challenges.length && <p className="empty">Nothing live. Open a challenge below, or rerun one from <a href="#history">your previous challenges</a>.</p>}
      <div className="list">
        {live.map((c) => (
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

        </section>

      {bounties.length > 0 && (
        <section className="card manage" id="bounties">
          <h3>Funded requests</h3>
          <p className="muted small">Fans put this money on things they want to see. Take one on and the money is yours when you start the attempt, whether or not you pull it off. Pass and they get it back.</p>
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
                  <ActionButton action={declineBountyAction.bind(null, b.id)} variant="ghost" confirm="Pass on this request and refund every fan who funded it?">
                    Decline
                  </ActionButton>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {suggestions.length > 0 && (
        <section className="card manage" id="ideas">
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
        <section className="card manage" id="invites">
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

      <ScoutPanel run={scoutRun} settings={settingsOf(user)} fanPage={fanPage} grok={usesGrok()} />

      <div id="new">
        <CreateChallengeForm key={seed?.id ?? (pickedPitch ? `pitch-${pitchParam}-${scoutRun?.at}` : "blank")} warnings={adapterStatus()} suggestion={seed} draft={draft} partners={partners} />
      </div>

        <section id="history">
          <h2>Previous challenges</h2>
          {past.length === 0 ? (
            <p className="empty">Nothing settled yet. Finished challenges collect here, ready to run again.</p>
          ) : (
            <div className="past-grid">
              {past.map((c) => (
                <PastTile key={c.id} challenge={c} userId={user.id} />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
