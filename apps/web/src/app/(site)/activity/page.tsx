import type { ChainEvent } from "@potted/chain";
import { formatUsd } from "@potted/core";
import Link from "next/link";
import { AutoRefresh } from "@/components/Live";
import { chainEvents, explorerUrl } from "@/lib/chain";
import { ledger } from "@/lib/ledger";
import { challengeByLedgerRef } from "@/lib/service";
import { autoPosting, xPosts } from "@/lib/x-posts";

const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

function describe(event: ChainEvent): string {
  const f = event.fields;
  switch (event.name) {
    case "ChallengeCreated":
      return `Challenge opened by ${short(String(f.streamer))}`;
    case "Pledged":
      return `${short(String(f.fan))} pledged ${formatUsd(Number(f.amount))}; pot at ${formatUsd(Number(f.totalPledged))}`;
    case "Locked":
      return `Pledging closed with ${formatUsd(Number(f.totalPledged))} in the pot${Number(f.upfrontPaid) > 0 ? `; ${formatUsd(Number(f.upfrontPaid))} paid up front` : ""}`;
    case "Cancelled":
      return `Cancelled by the streamer; ${formatUsd(Number(f.totalPledged))} open for refunds`;
    case "Settled":
      return f.success ? `Completed: ${formatUsd(Number(f.paidOut))} paid to the streamer` : "Not completed: refunds open";
    case "Refunded":
      return `${formatUsd(Number(f.amount))} returned to ${short(String(f.fan))}`;
    case "SharePaid":
      return `${formatUsd(Number(f.amount))} share paid from escrow to ${short(String(f.wallet))}`;
    case "SplitsSet":
      return `Shares fixed before any pledge: ${String(f.shares)
        .split(",")
        .map((p) => `${p.split(":")[1]}% to ${short(p.split(":")[0] ?? "")}`)
        .join(", ")}`;
  }
}

/** Every escrow event seen on chain, straight from the QuickNode Stream. */
export default function Activity() {
  const events = chainEvents();
  const posts = xPosts();
  const configured = Boolean(process.env.QUICKNODE_WEBHOOK_SECRET && process.env.POTTED_PROGRAM_ID);
  return (
    <>
      <AutoRefresh everyMs={4000} />
      <p className="eyebrow">On-chain activity</p>
      <h1>What the escrow program actually did</h1>
      <p className="lede">
        This page is not written by the app. Each row is an event the escrow program emitted on Solana, delivered by a QuickNode Stream
        and decoded here. If the app ever claimed a payout that did not happen, it would be missing from this list.
      </p>

      {events.length === 0 ? (
        <p className="empty">
          {ledger().kind === "sim"
            ? "Nothing yet: the app is on the simulated ledger, which sends no transactions."
            : configured
              ? "No events yet. They appear within seconds of a transaction confirming."
              : "The stream is not connected. Set QUICKNODE_WEBHOOK_SECRET and POTTED_PROGRAM_ID."}
        </p>
      ) : (
        <div className="card activity">
          {events.map((event) => {
            const challenge = challengeByLedgerRef(event.challenge);
            return (
              <div key={event.key} className="activity-row">
                <span className={`tag tag-${event.name.toLowerCase()}`}>{event.name === "ChallengeCreated" ? "Created" : event.name}</span>
                <span className="activity-text">
                  {describe(event)}
                  {challenge && (
                    <>
                      {" · "}
                      <Link href={`/c/${challenge.id}`}>{challenge.title}</Link>
                    </>
                  )}
                </span>
                <a className="mono small" href={explorerUrl(event.signature)} target="_blank" rel="noreferrer">
                  {short(event.signature)} · slot {event.slot}
                </a>
              </div>
            );
          })}
        </div>
      )}

      {posts.length > 0 && (
        <section className="x-posts">
          <h2>Grok on X</h2>
          <p className="muted small">
            When the Stream shows a pot reaching half way, its goal, or a result, Grok writes a post with the link to back it.{" "}
            {autoPosting() ? "Posts go out from Potted's account." : "They are drafts until auto-posting is on (POTTED_X_POSTS=auto)."}
          </p>
          <div className="card activity">
            {posts.map((post) => (
              <div key={post.key} className="activity-row">
                <span className={`tag tag-x-${post.status}`}>{post.status === "posted" ? "Posted" : post.status === "failed" ? "Failed" : "Draft"}</span>
                <span className="activity-text">
                  {post.text}
                  <span className="muted small"> · {post.by === "grok" ? "written by Grok" : "fixed text"}{post.error ? ` · ${post.error}` : ""}</span>
                </span>
                {post.postId ? (
                  <a className="mono small" href={`https://x.com/i/web/status/${post.postId}`} target="_blank" rel="noreferrer">
                    View on X
                  </a>
                ) : (
                  <a className="mono small" href={explorerUrl(post.signature)} target="_blank" rel="noreferrer">
                    {short(post.signature)}
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
