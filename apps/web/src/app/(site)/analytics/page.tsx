import { formatUsd } from "@potted/core";
import Link from "next/link";
import { CountUp, Ring } from "@/components/Motion";
import { redirect } from "next/navigation";
import { Wallet } from "@/components/Wallet";
import { climberStats, topPlanters } from "@/lib/service";
import { currentUser } from "@/lib/session";
import { giftTotals } from "@/lib/gifts";

/** A climber's numbers: what they earned, how often they deliver, and who backs them. */
export default async function Analytics() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "streamer") redirect(user.role === "mod" ? "/reviews" : "/garden");
  const stats = climberStats(user);
  const gifts = giftTotals(user.id);
  const planters = topPlanters(user.id, 8);
  const tallest = Math.max(1, ...stats.history.map((h) => h.potMicro));
  return (
    <>
      <div className="row between">
        <p className="eyebrow">Analytics</p>
        <Wallet user={user} />
      </div>
      <h1>
        {stats.total === 0 ? (
          "No challenges yet"
        ) : (
          <>
            <CountUp value={stats.earnedMicro} micro format="usd" duration={1500} /> earned from {stats.completed} completed
          </>
        )}
      </h1>

      <section className="stats">
        <div className="card stat stat-ring">
          <Ring pct={stats.completionPct} size={96} stroke={8} tone="green" label={`${stats.completionPct}% completion rate`}>
            <CountUp value={stats.completionPct} format="pct" className="ring-value" />
          </Ring>
          <span className="muted small">completion rate · {stats.completed} of {stats.completed + stats.missed}</span>
        </div>
        <div className="card stat">
          <span className="mono"><CountUp value={stats.averagePotMicro} micro format="usd" /></span>
          <span className="muted small">average pot</span>
        </div>
        <div className="card stat">
          <span className="mono"><CountUp value={stats.planters} /></span>
          <span className="muted small">planters · {stats.returning} came back</span>
        </div>
        <div className="card stat">
          <span className="mono"><CountUp value={stats.refundedMicro} micro format="usd" /></span>
          <span className="muted small">refunded to planters</span>
        </div>
        <div className="card stat">
          <span className="mono"><CountUp value={stats.raisedMicro} micro format="usd" /></span>
          <span className="muted small">raised for causes</span>
        </div>
        <div className="card stat">
          <span className="mono">
            <CountUp value={gifts.totalMicro} micro format="usd" />
          </span>
          <span className="muted small">
            in gifts · from {gifts.givers} {gifts.givers === 1 ? "planter" : "planters"}
          </span>
        </div>
        <div className="card stat">
          <span className="mono"><CountUp value={stats.live} /></span>
          <span className="muted small">live now</span>
        </div>
      </section>

      {stats.history.length > 0 && (
        <>
          <h2>Pots over time</h2>
          <div className="card chart" role="img" aria-label="Pot size of each settled challenge, oldest first">
            {stats.history.map((h) => (
              <Link key={h.id} href={`/c/${h.id}`} className="chart-col" title={`${h.title}: ${formatUsd(h.potMicro)}, ${h.paid ? "completed" : "refunded"}`}>
                <span className="mono small">{formatUsd(h.potMicro)}</span>
                <span className={h.paid ? "chart-bar chart-paid" : "chart-bar"} style={{ height: `${Math.max(4, (h.potMicro / tallest) * 120)}px` }} />
              </Link>
            ))}
          </div>
          <p className="muted small">Green pots were completed and paid. Gold pots were missed and refunded.</p>
        </>
      )}

      {stats.byGame.length > 0 && (
        <>
          <h2>By game</h2>
          <div className="card table">
            <div className="table-row table-head">
              <span>Game</span>
              <span>Challenges</span>
              <span>Completed</span>
              <span>Earned</span>
            </div>
            {stats.byGame.map((g) => (
              <div key={g.gameId} className="table-row">
                <Link href={`/g/${g.gameId}`}>{g.name}</Link>
                <span className="mono"><CountUp value={g.challenges} /></span>
                <span className="mono"><CountUp value={g.completed} /></span>
                <span className="mono"><CountUp value={g.earnedMicro} micro format="usd" /></span>
              </div>
            ))}
          </div>
        </>
      )}

      {planters.length > 0 && (
        <>
          <h2>Your top planters</h2>
          <ol className="card leaderboard">
            {planters.map((p, i) => (
              <li key={p.userId}>
                <span className="mono rank">{i + 1}</span>
                <span>{p.name}</span>
                <span className="muted small">
                  {p.challenges} {p.challenges === 1 ? "challenge" : "challenges"}
                </span>
                <span className="mono"><CountUp value={p.amountMicro} micro format="usd" /></span>
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}
