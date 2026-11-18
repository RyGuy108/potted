import { resolveRedemptionAction } from "@/app/actions";
import { MAX_REWARDS } from "@/lib/points";
import type { PointsConfig, Redemption } from "@/lib/store";
import { ActionButton } from "./ActionButton";
import { PointsSettings } from "./PointsSettings";

const ago = (at: number) => {
  const mins = Math.round((Date.now() - at) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
};

/** The climber's redemption queue ("queue", for the live page) or points setup with recent history ("setup", for the channel page). */
export function PointsPanel({ config, redemptions, mode }: { config: PointsConfig; redemptions: (Redemption & { fanName: string })[]; mode: "queue" | "setup" }) {
  if (mode === "setup") {
    const recent = redemptions.filter((r) => r.status !== "pending").slice(0, 5);
    return (
      <section className="card" id="points">
        <p className="eyebrow">Channel points</p>
        <h3>Points and rewards</h3>
        <PointsSettings initial={config} max={MAX_REWARDS} />
        {recent.length > 0 && (
          <p className="muted small">
            Recently: {recent.map((r) => `${r.fanName} · ${r.title} (${r.status === "fulfilled" ? "done" : "refunded"})`).join(" · ")}
          </p>
        )}
      </section>
    );
  }
  const pending = redemptions.filter((r) => r.status === "pending");
  const done = redemptions.filter((r) => r.status !== "pending").slice(0, 5);
  return (
    <section className="card" id="points">
      <p className="eyebrow">Channel points</p>
      <h3>{pending.length ? `${pending.length} ${pending.length === 1 ? "redemption" : "redemptions"} waiting` : "Redemptions"}</h3>
      {pending.length === 0 ? (
        <p className="muted small">Nothing waiting. When a planter redeems a reward it shows up here and on your overlay.</p>
      ) : (
        <ul className="queue">
          {pending.map((r) => (
            <li key={r.id}>
              <span>
                <strong>{r.fanName}</strong> redeemed <strong>{r.title}</strong> <span className="muted small">· {r.cost.toLocaleString()} points · {ago(r.at)}</span>
                {r.input && <span className="redeem-input">&ldquo;{r.input}&rdquo;</span>}
              </span>
              <span className="row">
                <ActionButton action={resolveRedemptionAction.bind(null, r.id, "fulfilled")}>Done</ActionButton>
                <ActionButton action={resolveRedemptionAction.bind(null, r.id, "refunded")} variant="ghost">
                  Refund points
                </ActionButton>
              </span>
            </li>
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <p className="muted small">
          Earlier: {done.map((r) => `${r.fanName} · ${r.title} (${r.status === "fulfilled" ? "done" : "refunded"})`).join(" · ")}
        </p>
      )}
      <p className="muted small">
        Change what planters can redeem on <a href="/dashboard/channel#points">Channel</a>.
      </p>
    </section>
  );
}
