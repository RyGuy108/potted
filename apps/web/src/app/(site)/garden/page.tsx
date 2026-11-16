import { formatUsd, growthOf } from "@potted/core";
import Link from "next/link";
import { Beanstalk } from "@/components/Beanstalk";
import { StatusPill } from "@/components/ChallengeCard";
import { SignInCard } from "@/components/SignInCard";
import { gameOf } from "@/lib/format";
import { gardenOf } from "@/lib/service";
import { currentUser } from "@/lib/session";

/** Every beanstalk a fan has helped grow, across all streamers. */
export default async function Garden() {
  const user = await currentUser();
  if (!user) {
    return (
      <>
        <p className="eyebrow">Your garden</p>
        <h1>Sign in to see what you have grown</h1>
        <SignInCard />
      </>
    );
  }
  const garden = gardenOf(user);
  return (
    <>
      <p className="eyebrow">Your garden</p>
      <h1>{garden.plots.length === 0 ? "Nothing planted yet" : `${garden.plots.length} planted, ${garden.grown} grown`}</h1>

      <section className="stats">
        <div className="card stat">
          <span className="mono">{formatUsd(garden.pledgedMicro)}</span>
          <span className="muted small">pledged in total</span>
        </div>
        <div className="card stat">
          <span className="mono">{formatUsd(garden.paidMicro)}</span>
          <span className="muted small">paid to streamers who delivered</span>
        </div>
        <div className="card stat">
          <span className="mono">{formatUsd(garden.returnedMicro)}</span>
          <span className="muted small">returned to you</span>
        </div>
      </section>

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
