import type { PlanterStats } from "@/lib/service";
import { Beanstalk } from "./Beanstalk";
import { CountUp, GrowBar, Ring, Scramble } from "./Motion";

/** A planter's level, with how far it is to the next one. */
export function LevelCard({ stats, lively = false }: { stats: PlanterStats; /** Quick counts and shuffled headings, for the garden page. */ lively?: boolean }) {
  const { level, xp } = stats;
  const span = level.next ? level.next.at - level.floor : 1;
  const ratio = level.next ? Math.min(1, (xp - level.floor) / span) : 1;
  return (
    <div className="card level">
      <Ring pct={ratio * 100} size={112} stroke={8} tone="green" label={`${Math.round(ratio * 100)}% of the way to the next level`}>
        <Beanstalk stage={Math.min(4, level.index)} size={66} />
      </Ring>
      <div className="level-body">
        <p className="eyebrow">{lively ? <Scramble text={`Level ${level.index + 1}`} /> : `Level ${level.index + 1}`}</p>
        <h3>{lively ? <Scramble text={level.name} /> : level.name}</h3>
        <GrowBar pct={ratio * 100} label="Growth toward the next level" />
        <p className="muted small">
          <span className="mono"><CountUp value={xp} duration={lively ? 650 : 1100} /></span> growth points
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
