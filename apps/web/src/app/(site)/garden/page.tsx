import { formatUsd, growthOf } from "@potted/core";
import Link from "next/link";
import { CountUp, Scramble } from "@/components/Motion";
import { GroupedByGame } from "@/components/GroupedByGame";
import { Beanstalk } from "@/components/Beanstalk";
import { StatusPill } from "@/components/ChallengeCard";
import { SignInPanel } from "@/components/SignInPanel";
import { gameOf } from "@/lib/format";
import { BadgeGrid } from "@/components/BadgeGrid";
import { allPointsOf } from "@/lib/points";
import { LevelCard } from "@/components/LevelCard";
import { Wallet } from "@/components/Wallet";
import { bountiesBackedBy, expireBounties, gardenOf, planterActivity, planterStats } from "@/lib/service";
import { currentUser } from "@/lib/session";

/** Every beanstalk a fan has helped grow, across all streamers. */
export default async function Garden() {
  const user = await currentUser();
  if (!user) {
    return (
      <>
        <p className="eyebrow">
          <Scramble text="Your garden" />
        </p>
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
  const activity = planterActivity(user);
  await expireBounties();
  const bounties = bountiesBackedBy(user);
  const myPoints = allPointsOf(user);
  return (
    <>
      <div className="row between">
        <p className="eyebrow">
          <Scramble text="Your garden" />
        </p>
        <Wallet user={user} />
      </div>
      <h1>
        <Scramble text={garden.plots.length === 0 ? "Nothing planted yet" : `${garden.plots.length} planted, ${garden.grown} grown`} duration={900} />
      </h1>

      <div className="home-top">
        <LevelCard stats={stats} lively />
        <div className="card next-up">
          <p className="eyebrow">
            <Scramble text="Next up" />
          </p>
          {nextBadge ? (
            <>
              <h3>
                <Scramble text={nextBadge.name} />
              </h3>
              <p className="muted">{nextBadge.how}.</p>
            </>
          ) : (
            <>
              <h3>
                <Scramble text="Every badge earned" />
              </h3>
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
          <span className="mono"><CountUp value={stats.backed} duration={650} /></span>
          <span className="muted small">
            <Scramble text="challenges backed" />
          </span>
        </div>
        <div className="card stat">
          <span className="mono"><CountUp value={stats.grown} duration={650} /></span>
          <span className="muted small">
            <Scramble text="completed by the climber" />
          </span>
        </div>
        <div className="card stat">
          <span className="mono"><CountUp value={stats.firstIn} duration={650} /></span>
          <span className="muted small">
            <Scramble text="times first to back" />
          </span>
        </div>
        <div className="card stat">
          <span className="mono"><CountUp value={stats.cloudPushes} duration={650} /></span>
          <span className="muted small">
            <Scramble text="pots you took to the clouds" />
          </span>
        </div>
        <div className="card stat">
          <span className="mono"><CountUp value={stats.streamersBacked} duration={650} /></span>
          <span className="muted small">
            <Scramble text="climbers backed" />
          </span>
        </div>
        <div className="card stat">
          <span className="mono"><CountUp value={garden.pledgedMicro} micro format="usd" duration={650} /></span>
          <span className="muted small">pledged · {formatUsd(garden.returnedMicro)} returned</span>
        </div>
      </section>

      <h2>
        Badges <span className="muted small">{earned} of {stats.badges.length}</span>
      </h2>
      <BadgeGrid badges={stats.badges} />

      {myPoints.length > 0 && (
        <>
          <h2>
            <Scramble text="Channel points" />
          </h2>
          <div className="points-list">
            {myPoints.map((p) => (
              <Link key={p.streamer.id} href={`/s/${p.streamer.handle}#points`} className="card points-chip">
                <strong>
                  <Scramble text={p.streamer.name} />
                </strong>
                <span className="mono">
                  <CountUp value={p.balance} duration={650} />
                </span>
                <span className="muted small">points to spend · {p.earned.toLocaleString()} earned</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {activity.length > 0 && (
        <>
          <h2>
            <Scramble text="Recent activity" />
          </h2>
          <div className="card table">
            {activity.map((row, i) => (
              <div key={i} className="table-row table-activity">
                <span className={row.kind === "paid" ? "success" : row.kind === "refunded" ? "warn" : undefined}>{row.text}</span>
                <Link href={`/c/${row.challenge.id}`}>{row.challenge.title}</Link>
              </div>
            ))}
          </div>
        </>
      )}

      {bounties.length > 0 && (
        <>
          <h2>
            <Scramble text="Your requests" />
          </h2>
          <div className="card table">
            {bounties.map(({ bounty, mineMicro, totalMicro, streamerName }) => (
              <div key={bounty.id} className="table-row table-activity">
                <span>
                  {bounty.text}
                  <span className="muted small"> · for {streamerName}</span>
                </span>
                <span>
                  <span className="mono"><CountUp value={mineMicro} micro format="usd" duration={650} /></span> of <span className="mono"><CountUp value={totalMicro} micro format="usd" duration={650} /></span> ·{" "}
                  {bounty.status === "open" ? (
                    <span className="warn">waiting for {streamerName}</span>
                  ) : bounty.status === "accepted" ? (
                    <Link href={`/c/${bounty.challengeId}`} className="success">
                      taken on: paid when they start
                    </Link>
                  ) : (
                    <span className="muted">{bounty.status === "declined" ? "passed" : "expired"}, returned to you</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <h2>Your plots</h2>
      {garden.plots.length === 0 ? (
        <p className="empty">
          Back a challenge on the <Link href="/s/ryan">demo stream</Link> and it shows up here.
        </p>
      ) : (
        <GroupedByGame
          all={<Plots plots={garden.plots} showGame />}
          groups={byGame(garden.plots).map(([label, plots]) => ({ label, count: plots.length, node: <Plots plots={plots} /> }))}
        />
      )}
    </>
  );
}

type Plot = ReturnType<typeof gardenOf>["plots"][number];

/** Plots grouped by game, biggest group first. */
function byGame(plots: Plot[]): [string, Plot[]][] {
  const groups = new Map<string, Plot[]>();
  for (const p of plots) {
    const name = gameOf(p.challenge).name;
    groups.set(name, [...(groups.get(name) ?? []), p]);
  }
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

function Plots({ plots, showGame = false }: { plots: Plot[]; showGame?: boolean }) {
  return (
    <div className="garden">
      {plots.map(({ challenge, streamerName, amountMicro, refunded }) => (
        <Link key={challenge.id} href={`/c/${challenge.id}`} className="card plot">
          <Beanstalk stage={growthOf(challenge.totalMicro, challenge.goalMicro).index} size={64} />
          <div>
            <div className="meta">
              {showGame && <span className="tag">{gameOf(challenge).name}</span>}
              <StatusPill challenge={challenge} />
            </div>
            <p className="plot-title">{challenge.title}</p>
            <p className="muted small">
              {streamerName} · <span className="mono">{formatUsd(amountMicro)}</span>
              {refunded ? " back" : ""}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
