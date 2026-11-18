import { notFound } from "next/navigation";
import { ChallengeCard } from "@/components/ChallengeCard";
import { AutoRefresh } from "@/components/Live";
import { SignInPanel } from "@/components/SignInPanel";
import { BountyBoard } from "@/components/BountyBoard";
import { SuggestForm } from "@/components/SuggestForm";
import { formatUsd } from "@potted/core";
import { activeCampaign, bountiesSupported, campaignStats, expireBounties, getStreamer, openBounties, raisedFor, settingsOf, stageChallenges, topPlanters } from "@/lib/service";
import { GrowBar } from "@/components/Motion";
import { currentUser } from "@/lib/session";
import { pointsConfig, pointsOf, redemptionsFor } from "@/lib/points";
import { twitchCategoryUrl, twitchChannel } from "@/lib/twitch";
import { gameNameOf } from "@/lib/format";
import { ChannelPoints } from "@/components/ChannelPoints";
import { CountUp } from "@/components/Motion";
import { FollowButton } from "@/components/FollowButton";
import { GiveForm } from "@/components/GiveForm";
import { giftTotals, giftsTo } from "@/lib/gifts";
import { followersOf, isFollowing } from "@/lib/notifications";
import { CategoryPreview, StreamHeader, StreamPreview } from "@/components/StreamHeader";

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
  const campaign = activeCampaign(streamer.id);
  const campaignNow = campaign ? campaignStats(campaign) : undefined;
  await expireBounties();
  const takesBounties = bountiesSupported() && cause.acceptingBounties;
  const bounties = bountiesSupported() ? openBounties(streamer.id) : [];
  const raised = raisedFor(streamer, cause.causeName);
  const twitch = cause.twitchChannel ? await twitchChannel(cause.twitchChannel) : null;
  const pointsSetup = pointsConfig(streamer.id);
  const gifted = giftTotals(streamer.id);
  const recentGifts = giftsTo(streamer.id, 5);
  // Without a Twitch channel, the preview points at the game the climber is playing now, or played last.
  const featured = live[0] ?? past[0];
  const featuredName = featured ? gameNameOf(featured) : undefined;
  return (
    <>
      <AutoRefresh pollIds={live.filter((c) => c.status === "locked").map((c) => c.id)} />
      <div className="stream-top">
        <div>
          <StreamHeader
            name={streamer.name}
            handle={streamer.handle!}
            twitch={twitch}
            twitchLogin={cause.twitchChannel}
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

      {(bounties.length > 0 || (user?.role === "fan" && (takesBounties || cause.acceptingSuggestions))) && (
        <>
          <h2>{takesBounties || bounties.length > 0 ? "Bounties and ideas" : "Got an idea?"}</h2>
          {bounties.length > 0 && <BountyBoard bounties={bounties} canBack={user?.role === "fan"} minUsd={cause.minPledgeUsd} />}
          {user?.role === "fan" && streamer.handle && (takesBounties || cause.acceptingSuggestions) && (
            <SuggestForm handle={streamer.handle} streamerName={streamer.name} bounties={takesBounties} ideas={cause.acceptingSuggestions} games={cause.acceptedGames} />
          )}
        </>
      )}

      <section className="card give-card" id="give">
        <div className="row between wrap">
          <div>
            <p className="eyebrow">Just give</p>
            <h3>Support {streamer.name} directly</h3>
            <p className="muted small">
              No challenge, nothing to complete: it goes straight to {streamer.name}
              {pointsSetup.on ? " and earns channel points like a pledge" : ""}. Gifts can't be refunded.
            </p>
          </div>
          {gifted.count > 0 && (
            <div className="give-total">
              <span className="mono">
                <CountUp value={gifted.totalMicro} micro format="usd" />
              </span>
              <span className="muted small">
                given by {gifted.givers} {gifted.givers === 1 ? "planter" : "planters"}
              </span>
            </div>
          )}
        </div>
        {user?.role === "fan" ? <GiveForm handle={streamer.handle!} name={streamer.name} minUsd={cause.minPledgeUsd} /> : <p className="muted small">Sign in as a planter to give.</p>}
        {recentGifts.length > 0 && (
          <ul className="gift-list">
            {recentGifts.map((g) => (
              <li key={g.id}>
                <strong>{g.fanName}</strong> gave <span className="mono">{formatUsd(g.amountMicro)}</span>
                {g.note && <span className="muted"> · &ldquo;{g.note}&rdquo;</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {pointsSetup.on && (
        <ChannelPoints
          streamerName={streamer.name}
          handle={streamer.handle!}
          config={pointsSetup}
          mine={user?.role === "fan" ? pointsOf(user, streamer.id) : undefined}
          recent={redemptionsFor(streamer.id, 4).map((r) => ({ fanName: r.fanName, title: r.title, at: r.at }))}
          canRedeem={user?.role === "fan"}
        />
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
