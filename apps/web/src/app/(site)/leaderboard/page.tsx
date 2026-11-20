import { formatUsd } from "@potted/core";
import Link from "next/link";
import { Beanstalk } from "@/components/Beanstalk";
import { Podium, RankAvatar } from "@/components/Podium";
import { type ClimberRow, type PlanterRow, climberBoard, planterBoard } from "@/lib/leaderboard";
import { LEVELS } from "@/lib/service";
import { currentUser } from "@/lib/session";

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const xp = (n: number) => `${n.toLocaleString("en-US")} XP`;
const planterCount = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "planter" : "planters"}`;

/** Planters ranked by garden XP, climbers by how many planters have backed them. No climber earnings are shown. */
export default async function Leaderboard({ searchParams }: { searchParams: Promise<{ board?: string }> }) {
  const user = await currentUser();
  const asked = (await searchParams).board;
  const board = asked === "climbers" || (!asked && user?.role === "streamer") ? "climbers" : "planters";
  const planters = board === "planters" ? planterBoard() : [];
  const climbers = board === "climbers" ? climberBoard() : [];
  const rows = board === "planters" ? planters : climbers;
  const mine = user ? rows.find((r) => r.user.id === user.id) : undefined;

  return (
    <div className="leaderboard-page">
      <div className="lb-top">
        <aside className="lb-you">
          <h1>Leaderboard</h1>
          <nav className="segmented" aria-label="Which leaderboard">
            <Link href="/leaderboard?board=planters" className={board === "planters" ? "on" : undefined} aria-current={board === "planters" ? "page" : undefined}>
              Planters
            </Link>
            <Link href="/leaderboard?board=climbers" className={board === "climbers" ? "on" : undefined} aria-current={board === "climbers" ? "page" : undefined}>
              Climbers
            </Link>
          </nav>
          <YourRank board={board} planter={board === "planters" ? (mine as PlanterRow | undefined) : undefined} climber={board === "climbers" ? (mine as ClimberRow | undefined) : undefined} signedIn={Boolean(user)} role={user?.role} />
          {board === "planters" && <LevelTrack current={(mine as PlanterRow | undefined)?.level.index} />}
          <p className="muted small lb-how">
            {board === "planters"
              ? "Planters climb by taking part: XP for every challenge backed, more when it's completed, and extra for being first in or the pledge that fills a pot. Pledge size alone doesn't buy rank."
              : "Climbers rank by how many different planters have backed their challenges. Earnings stay private."}
          </p>
        </aside>

        {rows.length === 0 ? (
          <p className="empty">Nobody on this board yet.</p>
        ) : (
          <Podium
            entries={
              board === "planters"
                ? planters.slice(0, 3).map((r) => ({ id: r.user.id, name: r.user.name, avatarUrl: r.user.profile?.publicProfile ? r.user.profile.avatarUrl : undefined, href: r.user.profile?.publicProfile ? `/u/${r.user.id}` : undefined, sub: r.level.name, value: xp(r.xp), lines: [`${pct(r.hitRate)} completed`, `${formatUsd(r.plantedMicro)} planted`], me: r.user.id === user?.id }))
                : climbers.slice(0, 3).map((r) => ({ id: r.user.id, name: r.user.name, avatarUrl: r.user.profile?.avatarUrl, href: `/s/${r.user.handle}`, sub: `@${r.user.handle}`, value: planterCount(r.planters), lines: [`${pct(r.completionRate)} completed`, `${r.completed} of ${r.challenges} challenges`], me: r.user.id === user?.id }))
            }
          />
        )}
      </div>

      {rows.length > 3 && (
        <table className="lb-table">
          <thead>
            {board === "planters" ? (
              <tr>
                <th>Rank</th>
                <th>Planter</th>
                <th className="num">Completed</th>
                <th className="num">Planted</th>
                <th className="num">XP</th>
              </tr>
            ) : (
              <tr>
                <th>Rank</th>
                <th>Climber</th>
                <th className="num">Completed</th>
                <th className="num">Challenges</th>
                <th className="num">Planters</th>
              </tr>
            )}
          </thead>
          <tbody>
            {board === "planters"
              ? planters.slice(3, 30).map((r) => (
                  <tr key={r.user.id} className={r.user.id === user?.id ? "me" : undefined}>
                    <td className="lb-rank mono">#{r.rank}</td>
                    <td>
                      <span className="lb-who">
                        <RankAvatar src={r.user.role === "streamer" || r.user.profile?.publicProfile ? r.user.profile?.avatarUrl : undefined} name={r.user.name} size={40} />
                        <span>
                          <strong>{r.user.profile?.publicProfile ? <Link href={`/u/${r.user.id}`}>{r.user.name}</Link> : r.user.name}</strong>
                          <span className="muted small">{r.level.name}</span>
                        </span>
                      </span>
                    </td>
                    <td className="num">{pct(r.hitRate)}</td>
                    <td className="num mono">{formatUsd(r.plantedMicro)}</td>
                    <td className="num mono strong">{xp(r.xp)}</td>
                  </tr>
                ))
              : climbers.slice(3, 30).map((r) => (
                  <tr key={r.user.id} className={r.user.id === user?.id ? "me" : undefined}>
                    <td className="lb-rank mono">#{r.rank}</td>
                    <td>
                      <span className="lb-who">
                        <RankAvatar src={r.user.role === "streamer" || r.user.profile?.publicProfile ? r.user.profile?.avatarUrl : undefined} name={r.user.name} size={40} />
                        <span>
                          <strong>
                            <Link href={`/s/${r.user.handle}`}>{r.user.name}</Link>
                          </strong>
                          <span className="muted small">
                            {r.completed} of {r.challenges} challenges completed
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="num">{pct(r.completionRate)}</td>
                    <td className="num">{r.challenges}</td>
                    <td className="num mono strong">{r.planters.toLocaleString("en-US")}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function YourRank({ board, planter, climber, signedIn, role }: { board: "planters" | "climbers"; planter?: PlanterRow; climber?: ClimberRow; signedIn: boolean; role?: string }) {
  if (board === "planters" && planter) {
    const next = planter.level.next;
    const progress = next ? (planter.xp - planter.level.floor) / (next.at - planter.level.floor) : 1;
    return (
      <div className="lb-me">
        <p className="muted small">
          Your rank: <strong className="ink">#{planter.rank}</strong> · {planter.level.name}
        </p>
        <p className="lb-me-xp mono">{xp(planter.xp)}</p>
        <div className="lb-me-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Progress to the next level">
          <span style={{ width: `${Math.max(3, progress * 100)}%` }} />
        </div>
        <p className="muted small">{next ? `${(next.at - planter.xp).toLocaleString("en-US")} XP to ${next.name}` : "Top level reached"}</p>
      </div>
    );
  }
  if (board === "climbers" && climber) {
    return (
      <div className="lb-me">
        <p className="muted small">
          Your rank: <strong className="ink">#{climber.rank}</strong>
        </p>
        <p className="lb-me-xp mono">{planterCount(climber.planters)}</p>
        <p className="muted small">
          {climber.completed} of {climber.challenges} challenges completed
        </p>
      </div>
    );
  }
  return (
    <div className="lb-me">
      <p className="muted small">Your rank: Unranked</p>
      <p className="muted small">
        {!signedIn ? (
          <>
            <Link href={board === "planters" ? "/signup/planter" : "/signup/climber"}>Sign up</Link> and {board === "planters" ? "back a challenge" : "open a challenge"} to get on the board.
          </>
        ) : (board === "planters" && role === "fan") || (board === "climbers" && role === "streamer") ? (
          board === "planters" ? "Back your first challenge to get on the board." : "Open your first challenge to get on the board."
        ) : (
          `This board is for ${board}.`
        )}
      </p>
    </div>
  );
}

/** The garden levels as a row of beanstalks, the current one lit. */
function LevelTrack({ current }: { current?: number }) {
  return (
    <ol className="lb-levels" aria-label="Planter levels">
      {LEVELS.map((l, i) => (
        <li key={l.name} className={i === current ? "on" : undefined} title={`${l.name}: ${l.at} XP`}>
          <Beanstalk stage={Math.min(4, i)} size={30} />
          {i === current && <span>{l.name}</span>}
        </li>
      ))}
    </ol>
  );
}
