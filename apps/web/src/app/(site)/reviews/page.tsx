import { formatUsd } from "@potted/core";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChallengeCard } from "@/components/ChallengeCard";
import { AutoRefresh } from "@/components/Live";
import { keeperStats } from "@/lib/service";
import { currentUser } from "@/lib/session";

/** A keeper's queue and record. */
export default async function Reviews() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "mod") redirect(user.role === "streamer" ? "/analytics" : "/garden");
  const stats = keeperStats(user);
  return (
    <>
      <AutoRefresh everyMs={5000} />
      <p className="eyebrow">Reviews</p>
      <h1>{stats.waiting.length === 0 ? "No disputes waiting" : `${stats.waiting.length} waiting for a ruling`}</h1>

      <section className="stats">
        <div className="card stat">
          <span className="mono">{stats.ruled.length}</span>
          <span className="muted small">rulings you made</span>
        </div>
        <div className="card stat">
          <span className="mono">{stats.upheld}</span>
          <span className="muted small">clips upheld · {formatUsd(stats.paidOutMicro)} paid out</span>
        </div>
        <div className="card stat">
          <span className="mono">{stats.rejected}</span>
          <span className="muted small">clips rejected · {formatUsd(stats.refundedMicro)} refunded</span>
        </div>
      </section>

      {stats.waiting.length > 0 && (
        <>
          <h2>Waiting</h2>
          <div className="list">
            {stats.waiting.map((c) => (
              <ChallengeCard key={c.id} challenge={c} />
            ))}
          </div>
        </>
      )}

      {stats.ruled.length > 0 && (
        <>
          <h2>Your rulings</h2>
          <div className="card table">
            <div className="table-row table-head">
              <span>Challenge</span>
              <span>Disputes</span>
              <span>Ruling</span>
              <span>Pot</span>
            </div>
            {stats.ruled.map((c) => (
              <div key={c.id} className="table-row">
                <Link href={`/c/${c.id}`}>{c.title}</Link>
                <span className="mono">{c.claim?.disputedBy.length}</span>
                <span className={c.claim?.ruling === "upheld" ? "success" : "warn"}>{c.claim?.ruling === "upheld" ? "Upheld" : "Rejected"}</span>
                <span className="mono">{formatUsd(c.totalMicro)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
