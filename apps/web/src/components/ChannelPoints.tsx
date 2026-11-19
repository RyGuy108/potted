import type { PointsConfig } from "@/lib/store";
import { CountUp } from "./Motion";
import { RedeemButton } from "./RedeemButton";

/** A climber's channel points: how planters earn them, and the rewards they buy. */
export function ChannelPoints({
  streamerName,
  handle,
  config,
  mine,
  canRedeem,
}: {
  streamerName: string;
  handle: string;
  config: PointsConfig;
  /** The signed-in planter's points with this climber. */
  mine?: { balance: number; earned: number };
  canRedeem: boolean;
}) {
  const rewards = config.rewards.filter((r) => r.enabled);
  return (
    <section className="card points" id="points">
      <div className="row between wrap">
        <div>
          <p className="eyebrow">Channel points</p>
          <h3>
            Earn {config.perUsd.toLocaleString()} points for every $1 you put into {streamerName}&apos;s pots
          </h3>
        </div>
        {mine && (
          <div className="points-balance">
            <span className="mono">
              <CountUp value={mine.balance} />
            </span>
            <span className="muted small">your points</span>
          </div>
        )}
      </div>
      {rewards.length === 0 ? (
        <p className="muted">{streamerName} hasn&apos;t added any rewards yet.</p>
      ) : (
        <div className="rewards">
          {rewards.map((r) => (
            <article key={r.id} className="reward">
              <div className="row between">
                <strong>{r.title}</strong>
                <span className="cost mono">{r.cost.toLocaleString()}</span>
              </div>
              {r.note && <p className="muted small">{r.note}</p>}
              {canRedeem ? (
                <RedeemButton handle={handle} rewardId={r.id} title={r.title} needsInput={r.needsInput} short={mine ? Math.max(0, r.cost - mine.balance) : r.cost} />
              ) : null}
            </article>
          ))}
        </div>
      )}
      {!canRedeem && <p className="muted small">Sign in as a planter to collect and spend points.</p>}
    </section>
  );
}
