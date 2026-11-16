import { formatUsd, growthOf } from "@potted/core";
import Link from "next/link";
import { Beanstalk } from "@/components/Beanstalk";
import { StatusPill } from "@/components/ChallengeCard";
import { SignInPanel } from "@/components/SignInPanel";
import { gameOf } from "@/lib/format";
import { LevelCard } from "@/components/LevelCard";
import { gardenOf, planterStats } from "@/lib/service";
import { currentUser } from "@/lib/session";

/** Every beanstalk a fan has helped grow, across all streamers. */
export default async function Garden() {
  const user = await currentUser();
  if (!user) {
    return (
      <>
        <p className="eyebrow">Your garden</p>
        <h1>Sign in to see what you have grown</h1>
        <SignInPanel />
      </>
    );
  }
  const garden = gardenOf(user);
  const stats = planterStats(user);
  const earned = stats.badges.filter((b) => b.earned).length;
  // The nearest thing to aim for, so the page always suggests a next step.
  const nextBadge = stats.badges.find((b) => !b.earned);
  return (
    <>
      <p className="eyebrow">Your garden</p>
      <h1>{garden.plots.length === 0 ? "Nothing planted yet" : `${garden.plots.length} planted, ${garden.grown} grown`}</h1>

      <div className="home-top">
        <LevelCard stats={stats} />
        <div className="card next-up">
          <p className="eyebrow">Next up</p>
          {nextBadge ? (
            <>
              <h3>{nextBadge.name}</h3>
              <p className="muted">{nextBadge.how}.</p>
            </>
          ) : (
            <>
              <h3>Every badge earned</h3>
              <p className="muted">Keep the streak going.</p>
            </>
          )}
          <p className="muted small">
            Growth points: 10 for each challenge you back, 15 more when it is completed, 5 for being first in, 10 for the pledge that reaches the goal.
            Points do not depend on how much you pledge.
          </p>
        </div>
      </div>

      <section className="stats">
        <div className="card stat">
          <span className="mono">{stats.backed}</span>
          <span className="muted small">challenges backed</span>
        </div>
        <div className="card stat">
          <span className="mono">{stats.grown}</span>
          <span className="muted small">completed by the climber</span>
        </div>
        <div className="card stat">
          <span className="mono">{stats.firstIn}</span>
          <span className="muted small">times first to back</span>
        </div>
        <div className="card stat">
          <span className="mono">{stats.cloudPushes}</span>
          <span className="muted small">pots you took to the clouds</span>
        </div>
        <div className="card stat">
          <span className="mono">{stats.streamersBacked}</span>
          <span className="muted small">climbers backed</span>
        </div>
        <div className="card stat">
          <span className="mono">{formatUsd(garden.pledgedMicro)}</span>
          <span className="muted small">pledged · {formatUsd(garden.returnedMicro)} returned</span>
        </div>
      </section>

      <h2>
        Badges <span className="muted small">{earned} of {stats.badges.length}</span>
      </h2>
      <div className="badges">
        {stats.badges.map((badge) => (
          <div key={badge.id} className={badge.earned ? "card badge-tile badge-earned" : "card badge-tile"}>
            <strong>{badge.name}</strong>
            <span className="muted small">{badge.how}</span>
            <span className="tag tag-quiet">{badge.earned ? "Earned" : "Locked"}</span>
          </div>
        ))}
      </div>

      <h2>Your plots</h2>
      {garden.plots.length === 0 ? (
        <p className="empty">
          Back a challenge on the <Link href="/s/ryan">demo stream</Link> and it shows up here.
        </p>
      ) : (
        <div className="garden">
          {garden.plots.map(({ challenge, streamerName, amountMicro, refunded }) => (
            <Link key={challenge.id} href={`/c/${challenge.id}`} className="card plot">
              <Beanstalk stage={growthOf(challenge.totalMicro, challenge.goalMicro).index} size={72} />
              <div>
                <div className="meta">
                  <span className="tag">{gameOf(challenge).name}</span>
                  <StatusPill challenge={challenge} />
                </div>
                <p className="plot-title">{challenge.title}</p>
                <p className="muted small">
                  {streamerName} · you put in <span className="mono">{formatUsd(amountMicro)}</span>
                  {refunded ? " and got it back" : ""}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
