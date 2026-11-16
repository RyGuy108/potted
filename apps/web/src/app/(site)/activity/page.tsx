import type { ChainEvent } from "@potted/chain";
import { formatUsd } from "@potted/core";
import Link from "next/link";
import { AutoRefresh } from "@/components/Live";
import { chainEvents, explorerUrl } from "@/lib/chain";
import { ledger } from "@/lib/ledger";
import { challengeByLedgerRef } from "@/lib/service";

const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

function describe(event: ChainEvent): string {
  const f = event.fields;
  switch (event.name) {
    case "ChallengeCreated":
      return `Challenge opened by ${short(String(f.streamer))}`;
    case "Pledged":
      return `${short(String(f.fan))} pledged ${formatUsd(Number(f.amount))}; pot at ${formatUsd(Number(f.totalPledged))}`;
    case "Locked":
      return `Pledging closed with ${formatUsd(Number(f.totalPledged))} in the pot`;
    case "Cancelled":
      return `Cancelled by the streamer; ${formatUsd(Number(f.totalPledged))} open for refunds`;
    case "Settled":
      return f.success ? `Completed: ${formatUsd(Number(f.paidOut))} paid to the streamer` : "Not completed: refunds open";
    case "Refunded":
      return `${formatUsd(Number(f.amount))} returned to ${short(String(f.fan))}`;
  }
}

/** Every escrow event seen on chain, straight from the QuickNode Stream. */
export default function Activity() {
  const events = chainEvents();
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
    </>
  );
}
