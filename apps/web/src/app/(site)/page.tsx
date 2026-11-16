import { formatUsd } from "@potted/core";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChallengeCard } from "@/components/ChallengeCard";
import { Icon } from "@/components/Icon";
import { LevelCard } from "@/components/LevelCard";
import { Marketing } from "@/components/Marketing";
import { ROLES } from "@/lib/roles";
import { disputesWaiting, gardenOf, listStreamers, liveEverywhere, planterStats, stageChallenges } from "@/lib/service";
import { currentUser } from "@/lib/session";

/**
 * Visitors get the explanation. Someone signed in already knows what
 * Potted is, so they get what is happening now and where they stand.
 */
export default async function Home() {
  const user = await currentUser();
  if (!user) return <Marketing />;
  if (user.onboarded === false) redirect("/welcome");
  if (user.role === "streamer") redirect("/dashboard");

  const live = liveEverywhere();
  const streamers = listStreamers();

  if (user.role === "mod") {
    const disputes = disputesWaiting();
    return (
      <>
        <p className="eyebrow">{ROLES.mod.label}</p>
        <h1>{disputes.length === 0 ? "Nothing needs a ruling" : `${disputes.length} disputed ${disputes.length === 1 ? "clip needs" : "clips need"} a ruling`}</h1>
        <p className="lede">{ROLES.mod.blurb}</p>
        <div className="list">
          {disputes.map((c) => (
            <ChallengeCard key={c.id} challenge={c} />
          ))}
        </div>
        {live.length > 0 && (
          <>
            <h2>Growing now</h2>
            <div className="list">
              {live.map((c) => (
                <ChallengeCard key={c.id} challenge={c} />
              ))}
            </div>
          </>
        )}
      </>
    );
  }

  const stats = planterStats(user);
  const garden = gardenOf(user);
  return (
    <>
      <p className="eyebrow">Welcome back</p>
      <h1>{stats.backed === 0 ? `Ready to plant, ${user.name}?` : `Your garden is growing, ${user.name}`}</h1>

      <div className="home-top">
        <LevelCard stats={stats} />
        <div className="card home-stats">
          <div>
            <span className="mono">{stats.backed}</span>
            <span className="muted small">challenges backed</span>
          </div>
          <div>
            <span className="mono">{stats.grown}</span>
            <span className="muted small">completed</span>
          </div>
          <div>
            <span className="mono">{formatUsd(garden.returnedMicro)}</span>
            <span className="muted small">returned to you</span>
          </div>
          <Link href="/garden" className="btn btn-ghost">
            Open my garden <Icon name="arrow" size={15} />
          </Link>
        </div>
      </div>

      <h2>Growing now</h2>
      {live.length === 0 ? (
        <p className="empty">No challenges are open right now. They show up here the moment a climber posts one.</p>
      ) : (
        <div className="list">
          {live.map((c) => (
            <ChallengeCard key={c.id} challenge={c} />
          ))}
        </div>
      )}

      <h2>{ROLES.streamer.plural}</h2>
      <div className="streamers">
        {streamers.map((s) => {
          const open = stageChallenges(s.id).filter((c) => c.status === "open" || c.status === "locked").length;
          return (
            <Link key={s.id} href={`/s/${s.handle}`} className="card streamer-card">
              <strong>{s.name}</strong>
              <span className="muted small">{open === 0 ? "Nothing open" : `${open} live ${open === 1 ? "challenge" : "challenges"}`}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
