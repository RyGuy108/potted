import Link from "next/link";
import type { User } from "@/lib/store";
import { Wallet } from "./Wallet";

const TABS = [
  { id: "challenges", href: "/dashboard", label: "Challenges", note: "While you're live" },
  { id: "channel", href: "/dashboard/channel", label: "Channel", note: "Setup, money and history" },
] as const;

/** The two halves of the climber dashboard, with the wallet. */
export function DashHead({ user, tab, title, lede }: { user: User; tab: (typeof TABS)[number]["id"]; title: string; lede: string }) {
  return (
    <header className="dash-head">
      <div className="row between">
        <p className="eyebrow">Dashboard</p>
        <Wallet user={user} />
      </div>
      <h1>{title}</h1>
      <p className="muted">{lede}</p>
      <nav className="dash-tabs" aria-label="Dashboard pages">
        {TABS.map((t) => (
          <Link key={t.id} href={t.href} className={t.id === tab ? "on" : undefined} aria-current={t.id === tab ? "page" : undefined}>
            <span>{t.label}</span>
            <span className="small muted">{t.note}</span>
          </Link>
        ))}
      </nav>
    </header>
  );
}

/** Shown on dashboard pages to anyone who isn't a climber. */
export function NotAClimber({ user }: { user?: User }) {
  return (
    <div className="login">
      <h1>Climber dashboard</h1>
      {user ? (
        <>
          <p className="lede">This page is for climbers. Your account is for {user.role === "mod" ? "reviewing disputed clips" : "backing challenges"}.</p>
          <Link href={user.role === "mod" ? "/reviews" : "/"} className="btn btn-primary">
            {user.role === "mod" ? "Go to reviews" : "Go to my home"}
          </Link>
        </>
      ) : (
        <>
          <p className="lede">Log in to your climber account to open challenges and run attempts.</p>
          <div className="row">
            <Link href="/login" className="btn btn-primary">
              Log in
            </Link>
            <Link href="/signup/climber" className="btn btn-ghost">
              Sign up as a climber
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
