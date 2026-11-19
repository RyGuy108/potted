import { GAMES } from "@potted/core";
import Link from "next/link";
import { openPitchAction, runScoutAction } from "@/app/actions";
import { clock } from "@/lib/format";
import type { ScoutRun, StreamSettings } from "@/lib/store";
import { ActionButton } from "./ActionButton";
import { AutopilotControl } from "./AutopilotControl";

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
};

/**
 * The climber's scout: Grok's pitches for what to run next, why, and a line
 * to pitch each one to viewers. Opening one goes through the normal checks.
 */
export function ScoutPanel({ run, settings, fanPage, grok }: { run?: ScoutRun; settings: StreamSettings; fanPage: string; /** Whether an xAI key is set. */ grok: boolean }) {
  return (
    <section className="card scout" id="scout">
      <div className="row between">
        <div>
          <p className="eyebrow">Grok scout</p>
          <h3>What to pitch next</h3>
        </div>
        <ActionButton action={runScoutAction}>{run ? "Scout again" : "Scout now"}</ActionButton>
      </div>
      <p className="muted small">
        {grok
          ? "Grok searches X and the web for what is popular in your games this week, then weighs it against your own record and the pledges QuickNode reported from the chain."
          : "No xAI key is set, so the scout works from your own record and your planters' ideas. Add XAI_API_KEY to let Grok search X for trends."}{" "}
        It takes up to a minute.
      </p>
      <AutopilotControl on={settings.autopilot} maxGoalUsd={settings.scoutMaxGoalUsd} />

      {run && (
        <>
          <p className="scout-summary">
            <span className={`tag ${run.source === "grok" ? "tag-grok" : "tag-quiet"}`}>{run.source === "grok" ? "Grok · X and web search" : "Rules"}</span> {run.summary}
          </p>
          <p className="muted small">
            Scouted {clock(run.at)}
            {run.postsRead ? ` · read ${run.postsRead} posts on X` : ""}
            {` · on chain in the last day: ${run.chain.pledges} ${run.chain.pledges === 1 ? "pledge" : "pledges"} ($${run.chain.pledgedUsd.toFixed(2)}), ${run.chain.settled} settled`}
            {run.fallback ? ` · Grok not used: ${run.fallback}` : ""}
          </p>
          <div className="pitches">
            {run.pitches.map((p, i) => {
              const opened = run.opened[i];
              const gameName = p.fields.game ?? GAMES.find((g) => g.id === p.gameId)?.name ?? p.gameId;
              const post = `https://x.com/intent/post?text=${encodeURIComponent(`${p.hook} ${fanPage}`)}`;
              return (
                <article key={i} className={`pitch${opened ? " pitch-opened" : ""}`}>
                  <span className="muted small">{gameName}</span>
                  <h4>{p.title}</h4>
                  <p className="mono small">
                    ${p.goalUsd} goal · ${p.capUsd} per planter · {p.minutes} min{p.upfrontPct ? ` · ${p.upfrontPct}% up front` : ""}
                  </p>
                  <p className="small">{p.why}</p>
                  {p.sources.length > 0 && (
                    <p className="muted small">
                      Based on{" "}
                      {p.sources.map((s, j) => (
                        <span key={s.url}>
                          {j > 0 && ", "}
                          <a href={s.url} target="_blank" rel="noreferrer">
                            {host(s.url)}
                          </a>
                        </span>
                      ))}
                    </p>
                  )}
                  <blockquote className="hook">{p.hook}</blockquote>
                  <div className="row">
                    {opened ? (
                      <Link href={`/c/${opened}`} className="btn btn-ghost">
                        Opened · view
                      </Link>
                    ) : (
                      <>
                        {p.goalUsd <= settings.scoutMaxGoalUsd && <ActionButton action={openPitchAction.bind(null, i)}>Open now</ActionButton>}
                        <Link href={`/dashboard?pitch=${i}#new`} className="btn btn-ghost">
                          Edit first
                        </Link>
                      </>
                    )}
                    <a href={post} target="_blank" rel="noreferrer" className="btn btn-ghost">
                      Post on X
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
