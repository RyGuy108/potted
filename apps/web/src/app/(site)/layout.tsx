import Link from "next/link";
import { signOutAction } from "@/app/actions";
import { NavLink } from "@/components/NavLink";
import { NotificationBell } from "@/components/NotificationBell";
import { unreadCount } from "@/lib/notifications";
import { ActionButton } from "@/components/ActionButton";
import { Beanstalk } from "@/components/Beanstalk";
import { ledger } from "@/lib/ledger";
import { currentUser } from "@/lib/session";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <>
      <header className="site-header">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Beanstalk stage={3} size={36} label="Potted" />
          </span>
          <span>Potted</span>
        </Link>
        <nav>
          <Link href="/browse">Browse</Link>
          {user?.role === "streamer" && <NavLink href="/dashboard" exact>Challenges</NavLink>}
          {user?.role === "streamer" && <NavLink href="/dashboard/channel">Channel</NavLink>}
          {user?.role === "streamer" && <Link href="/analytics">Analytics</Link>}
          {user?.role === "fan" && <Link href="/garden">My garden</Link>}
          {user?.role === "mod" && <Link href="/reviews">Reviews</Link>}
          <NavLink href="/leaderboard">Leaderboard</NavLink>
          {user && <Link href="/about">How it works</Link>}
        </nav>
        <form className="search" action="/search" role="search">
          <input type="search" name="q" placeholder="Search streams or climbers" aria-label="Search streams or climbers" maxLength={60} />
        </form>
        <div className="session">
          {user ? (
            <>
              <NotificationBell initialUnread={unreadCount(user)} />
              <span className="who">{user.name}</span>
              <ActionButton action={signOutAction} variant="ghost">
                Sign out
              </ActionButton>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost">
                Log in
              </Link>
              <Link href="/signup" className="btn btn-primary">
                Sign up
              </Link>
            </>
          )}
        </div>
      </header>
      {ledger().kind === "sim" && (
        <div className="banner">Simulated ledger: balances are test numbers stored locally, not on-chain tokens.</div>
      )}
      <main>{children}</main>
      <footer className="site-footer muted small">
        Potted · UBC 2026 hackathon prototype · devnet only · <Link href="/activity">On-chain record</Link>
      </footer>
    </>
  );
}
