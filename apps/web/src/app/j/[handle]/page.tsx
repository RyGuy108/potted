import { growthOf } from "@potted/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JoinFlow } from "@/components/JoinFlow";
import { balanceOf, fundersOf, getStreamer, liveSessionOf, stageChallenges } from "@/lib/service";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * The first-time fan's way in: the link a chat bot posts and the overlay's
 * QR code opens. One screen, no browsing: the challenge on stream now, a $5
 * button, sign-in in place, then "listen for your name".
 */
export default async function Join({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const streamer = getStreamer(handle);
  if (!streamer?.handle) notFound();
  const user = await currentUser();
  // The open challenge with the most going on: the one people in chat are talking about.
  const open = stageChallenges(streamer.id)
    .filter((c) => c.status === "open" && c.deadline > Date.now())
    .sort((a, b) => b.totalMicro - a.totalMicro);
  const challenge = open[0];
  const session = liveSessionOf(streamer);
  return (
    <main className="join">
      <header className="join-head">
        <Link href="/" className="join-logo">
          Potted
        </Link>
        {session && <span className="live-pill">● Live on {session.platform === "youtube" ? "YouTube" : session.platform === "kick" ? "Kick" : "Twitch"}</span>}
      </header>
      {challenge ? (
        <JoinFlow
          handle={streamer.handle}
          streamerName={streamer.name}
          challenge={{
            id: challenge.id,
            title: challenge.title,
            totalMicro: challenge.totalMicro,
            goalMicro: challenge.goalMicro,
            planters: fundersOf(challenge.id).length,
            stage: growthOf(challenge.totalMicro, challenge.goalMicro).index,
          }}
          me={user ? { name: user.name, role: user.role, balanceMicro: await balanceOf(user), backed: fundersOf(challenge.id).some((f) => f.userId === user.id) } : null}
        />
      ) : (
        <section className="join-card">
          <p className="eyebrow">{streamer.name}</p>
          <h1>No challenge is open right now</h1>
          <p className="muted">Suggest one, or tip {streamer.name} directly.</p>
          <Link className="btn btn-primary" href={`/s/${streamer.handle}`}>
            Go to {streamer.name}&apos;s page
          </Link>
        </section>
      )}
    </main>
  );
}
