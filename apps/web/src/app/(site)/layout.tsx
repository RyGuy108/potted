import { formatUsd } from "@potted/core";
import Link from "next/link";
import { signOutAction } from "@/app/actions";
import { ActionButton } from "@/components/ActionButton";
import { Plant } from "@/components/Plant";
import { ledger } from "@/lib/ledger";
import { balanceOf } from "@/lib/service";
import { currentUser } from "@/lib/session";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const balance = user ? await balanceOf(user) : 0;
  return (
    <>
      <header className="site-header">
        <Link href="/" className="brand">
          <Plant stage={3} size={30} label="Potted" />
          <span>Potted</span>
        </Link>
        <nav>
          <Link href="/s/ryan">Demo stream</Link>
          {user?.role === "streamer" && <Link href="/dashboard">Dashboard</Link>}
        </nav>
        <div className="session">
          {user ? (
            <>
              <span className="who">
                {user.name}
                <span className="tag tag-quiet">{user.role}</span>
              </span>
              <span className="mono balance" title="Test USDC balance">
                {formatUsd(balance)}
              </span>
              <ActionButton action={signOutAction} variant="ghost">
                Sign out
              </ActionButton>
            </>
          ) : (
            <Link href="/#try" className="btn btn-ghost">
              Sign in
            </Link>
          )}
        </div>
      </header>
      {ledger().kind === "sim" && (
        <div className="banner">Simulated ledger: balances are test numbers stored locally, not on-chain tokens.</div>
      )}
      <main>{children}</main>
      <footer className="site-footer muted small">Potted · UBC 2026 hackathon prototype · devnet only</footer>
    </>
  );
}
