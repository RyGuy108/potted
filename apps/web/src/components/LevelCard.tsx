import type { PlanterStats } from "@/lib/service";
import { Beanstalk } from "./Beanstalk";

/** A planter's level, with how far it is to the next one. */
export function LevelCard({ stats }: { stats: PlanterStats }) {
  const { level, xp } = stats;
  const span = level.next ? level.next.at - level.floor : 1;
  const ratio = level.next ? Math.min(1, (xp - level.floor) / span) : 1;
  return (
    <div className="card level">
      <Beanstalk stage={Math.min(4, level.index)} size={84} />
      <div className="level-body">
        <p className="eyebrow">Level {level.index + 1}</p>
        <h3>{level.name}</h3>
        <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}>
          <span style={{ width: `${ratio * 100}%` }} />
        </div>
        <p className="muted small">
          <span className="mono">{xp}</span> growth points
          {level.next ? (
            <>
              {" · "}
              <span className="mono">{level.next.at - xp}</span> to {level.next.name}
            </>
          ) : (
            " · top level"
          )}
        </p>
        {stats.streakDays > 0 && (
          <p className="streak small">
            {stats.streakDays}-day planting streak
          </p>
        )}
      </div>
    </div>
  );
}
