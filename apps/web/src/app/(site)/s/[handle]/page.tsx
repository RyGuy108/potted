import type { Challenge } from "@potted/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChallengeCard } from "@/components/ChallengeCard";
import { AutoRefresh } from "@/components/Live";
import { SignInPanel } from "@/components/SignInPanel";
import { BountyBoard } from "@/components/BountyBoard";
import { SuggestForm } from "@/components/SuggestForm";
import { formatUsd } from "@potted/core";
import { activeCampaign, bountiesSupported, campaignStats, expireBounties, getStreamer, liveSessionOf, openBounties, raisedFor, settingsOf, stageChallenges, topPlanters } from "@/lib/service";
import { GrowBar } from "@/components/Motion";
import { currentUser } from "@/lib/session";
import { pointsConfig, pointsOf } from "@/lib/points";
import { twitchCategoryUrl, twitchChannel } from "@/lib/twitch";
import { gameNameOf } from "@/lib/format";
import { ChannelPoints } from "@/components/ChannelPoints";
import { CountUp } from "@/components/Motion";
import { FollowButton } from "@/components/FollowButton";
import { GiveForm } from "@/components/GiveForm";
import { WinnerStrip } from "@/components/Podium";
import { GroupedByGame } from "@/components/GroupedByGame";
import { groupByGame } from "@/lib/format";
import { followersOf, isFollowing } from "@/lib/notifications";
import { CategoryPreview, StreamHeader, StreamPreview } from "@/components/StreamHeader";
import { ShareButtons } from "@/components/ShareButtons";
import type { Metadata } from "next";

/** A shared streamer link unfurls as their card: what is live and their record. */
export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const streamer = getStreamer(handle);
  if (!streamer) return {};
  const title = `${streamer.name} on Potted`;
  const description = `Back ${streamer.name}'s challenges. A pledge pays out only if they pull it off, and comes back if they miss.`;
  const image = { url: `/api/cards/streamer/${handle}`, width: 1200, height: 630, alt: title };
  return { title, description, openGraph: { title, description, images: [image] }, twitter: { card: "summary_large_image", title, description, images: [image.url] } };
}

export default async function StreamerPage({ params, searchParams }: { params: Promise<{ handle: string }>; searchParams: Promise<{ from?: string }> }) {
  const { handle } = await params;
  const fromSurprise = (await searchParams).from === "surprise";
  const streamer = getStreamer(handle);
  if (!streamer) notFound();
  const user = await currentUser();
  const challenges = stageChallenges(streamer.id);
  const live = challenges.filter((c) => c.status === "open" || c.status === "locked");
  const past = challenges.filter((c) => c.status === "paid" || c.status === "failed");

  const planters = topPlanters(streamer.id);
  const cause = settingsOf(streamer);
  const campaign = activeCampaign(streamer.id);
  const campaignNow = campaign ? campaignStats(campaign) : undefined;
  await expireBounties();
  const takesBounties = bountiesSupported() && cause.acceptingBounties;
  const canSuggest = Boolean(user?.role === "fan" && streamer.handle && (takesBounties || cause.acceptingSuggestions));
  const bounties = bountiesSupported() ? openBounties(streamer.id) : [];
  const raised = raisedFor(streamer, cause.causeName);
  const twitch = cause.twitchChannel ? await twitchChannel(cause.twitchChannel) : null;
  const pointsSetup = pointsConfig(streamer.id);
  // Without a Twitch channel, the preview points at the game the climber is playing now, or played last.
  const featured = live[0] ?? past[0];
  const featuredName = featured ? gameNameOf(featured) : undefined;
  return (
    <>
      <AutoRefresh pollIds={live.filter((c) => c.status === "locked").map((c) => c.id)} />
      {fromSurprise && (
        <div className="surprise-bar" role="status">
          <span>
            Picked at random for you: <strong>{streamer.name}</strong>
          </span>
          <a href={`/browse/random?skip=${streamer.handle}`} className="btn btn-ghost">
            Spin again
          </a>
        </div>
      )}
      <div className="stream-top">
        <div>
          <StreamHeader
            name={streamer.name}
            handle={streamer.handle!}
            twitch={twitch}
            twitchLogin={cause.twitchChannel}
            session={liveSessionOf(streamer)}
            follow={
              user?.role === "fan" ? (
                <div className="row follow-row">
                  <FollowButton handle={streamer.handle!} name={streamer.name} following={isFollowing(user, streamer.id)} />
                  <span className="muted small">{followersOf(streamer.id).length} following</span>
                </div>
              ) : undefined
            }
          />
          <p className="lede">Pick a challenge and add to its pot. If {streamer.name} misses it, you get your pledge back.</p>
          <ShareButtons
            path={`/s/${streamer.handle}`}
            text={user?.id === streamer.id ? "Back my challenges on Potted. Every pledge pays only if I pull it off:" : `Back ${streamer.name}'s challenges on Potted. It only pays if they pull it off:`}
            card={`/api/cards/streamer/${streamer.handle}`}
            cardName={`potted-${streamer.handle}.png`}
          />
        </div>
        {twitch ? (
          <StreamPreview twitch={twitch} name={streamer.name} />
        ) : (
          <CategoryPreview name={streamer.name} gameId={featured?.gameId} gameName={featuredName} url={twitchCategoryUrl(featured?.gameId, featuredName)} />
        )}
      </div>

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
            <strong className="mono">
              <CountUp value={raised.raisedMicro} micro format="usd" />
            </strong>{" "}
            raised so far
            {raised.inPlayMicro > 0 && (
              <>
                {" · "}
                <span className="mono">{formatUsd(raised.inPlayMicro)}</span> more if the live challenges are completed
              </>
            )}
            {raised.confirmedMicro > 0 && (
              <span className="cause-confirmed" title="Seen arriving at the cause's wallet by a QuickNode Stream">
                ✓ <span className="mono">{formatUsd(raised.confirmedMicro)}</span> confirmed on Solana
              </span>
            )}
          </p>
          <p className="muted small">The cause is named by {streamer.name}. This prototype does not verify charities.</p>
        </section>
      )}

      {!user && <SignInPanel />}

      {campaign && campaignNow && (
        <div className="campaign-banner">
          <div>
            <p className="eyebrow">Campaign</p>
            <strong>{campaign.name}</strong>
            <p className="muted small">
              {campaignNow.challenges} {campaignNow.challenges === 1 ? "challenge" : "challenges"}, {campaignNow.completed} completed, {campaignNow.planters}{" "}
              {campaignNow.planters === 1 ? "planter" : "planters"}
            </p>
          </div>
          <span className="mono">
            {formatUsd(campaignNow.raisedMicro)}
            {campaign.goalMicro > 0 ? <span className="muted"> of {formatUsd(campaign.goalMicro)}</span> : " raised"}
          </span>
          {campaign.goalMicro > 0 && <GrowBar pct={Math.min(100, (campaignNow.raisedMicro / campaign.goalMicro) * 100)} label="Campaign progress" duration={2200} />}
        </div>
      )}

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

      {(bounties.length > 0 || canSuggest) && (
        <>
          <h2>{bounties.length > 0 ? "Requests from fans" : "Got an idea?"}</h2>
          {bounties.length > 0 && <BountyBoard bounties={bounties} canBack={user?.role === "fan"} minUsd={cause.minPledgeUsd} />}
        </>
      )}

      <div className={canSuggest ? "idea-give" : undefined}>
        {canSuggest && (
          <div className="idea-col">
            <SuggestForm handle={streamer.handle!} streamerName={streamer.name} bounties={takesBounties} ideas={cause.acceptingSuggestions} games={cause.acceptedGames} />
          </div>
        )}
        <section className="card give-card" id="give">
          <div className="row between wrap">
            <div>
              <p className="eyebrow">Tip</p>
              <h3>Support {streamer.name} directly</h3>
              <p className="muted small">Goes straight to {streamer.name}. Not refundable.</p>
            </div>
            </div>
          {user?.role === "fan" ? <GiveForm handle={streamer.handle!} name={streamer.name} minUsd={cause.minPledgeUsd} /> : <p className="muted small">Sign in as a planter to give.</p>}
          </section>
      </div>

      {pointsSetup.on && (
        <ChannelPoints
          streamerName={streamer.name}
          handle={streamer.handle!}
          config={pointsSetup}
          mine={user?.role === "fan" ? pointsOf(user, streamer.id) : undefined}
          canRedeem={user?.role === "fan"}
        />
      )}

      {planters.length > 0 && (
        <>
          <div className="row between wrap">
            <h2>Top planters</h2>
            <Link href="/leaderboard" className="muted small">Full leaderboard</Link>
          </div>
          <WinnerStrip
            tags={["Head gardener", "Green thumb"]}
            entries={planters.map((p, i) => ({
              id: p.userId,
              rank: i + 1,
              name: p.name,
              value: formatUsd(p.amountMicro),
              lines: [`${p.challenges} ${p.challenges === 1 ? "challenge" : "challenges"} backed`],
              me: p.userId === user?.id,
            }))}
          />
        </>
      )}

      {past.length > 0 && (
        <>
          <h2>Settled</h2>
          <GroupedByGame
            all={<Cards list={past} />}
            groups={groupByGame(past).map(([label, list]) => ({ label, count: list.length, node: <Cards list={list} /> }))}
          />
        </>
      )}
    </>
  );
}

function Cards({ list }: { list: Challenge[] }) {
  return (
    <div className="list">
      {list.map((c) => (
        <ChallengeCard key={c.id} challenge={c} />
      ))}
    </div>
  );
}
