import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getUser, planterStats } from "@/lib/service";
import { currentUser } from "@/lib/session";
import { Avatar } from "@/components/Avatar";
import { AccountProfile } from "@/components/AccountProfile";
import { BadgeGrid } from "@/components/BadgeGrid";
import { Beanstalk } from "@/components/Beanstalk";

export const metadata = { title: "Community profile · Potted", robots: { index: false } };

export default async function Profile({ params }: { params: Promise<{ id: string }> }) {
  const user = getUser((await params).id);
  if (!user) notFound();
  if (user.role === "streamer" && user.handle) redirect(`/s/${user.handle}`);
  const own = (await currentUser())?.id === user.id;
  if (!own && !user.profile?.publicProfile) notFound();

  const garden = user.role === "fan" ? planterStats(user) : undefined;
  // The refund badge discloses a financial outcome. Only show earned achievement badges.
  const achievements = garden?.badges.filter(badge => badge.earned && badge.id !== "money-back") ?? [];

  return (
    <>
      <div className="row between wrap">
        <div className="account-profile-heading">
          <Avatar name={user.name} handle={user.id} src={user.profile?.avatarUrl} />
          <div>
            <p className="eyebrow">{user.role === "mod" ? "Keeper" : "Planter"}</p>
            <h1>{user.name}</h1>
          </div>
        </div>
        {own && <Link href="/settings" className="btn btn-ghost">Edit profile</Link>}
      </div>
      {own && !user.profile?.publicProfile && (
        <p className="settings-notice">Only you can see this profile. Publish it in Settings when you’re ready.</p>
      )}
      <AccountProfile user={user} />
      {garden && (
        <section className="public-garden">
          <h2>Garden</h2>
          <div className="card row">
            <Beanstalk stage={Math.min(4, garden.level.index)} size={64} />
            <div>
              <p className="eyebrow">Level {garden.level.index + 1}</p>
              <strong>{garden.level.name}</strong>
            </div>
          </div>
          <h3>Earned badges</h3>
          {achievements.length ? <BadgeGrid badges={achievements} /> : <p className="muted">No achievement badges yet.</p>}
        </section>
      )}
    </>
  );
}
