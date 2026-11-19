import { formatUsd } from "@potted/core";
import Link from "next/link";
import { endCampaignAction } from "@/app/actions";
import { explorerTxUrl, isSimTx } from "@/lib/ledger";
import { type PayoutRow, activeCampaign, campaignStats, campaignsOf, payoutsFor } from "@/lib/service";
import type { User } from "@/lib/store";
import { ActionButton } from "./ActionButton";
import { CampaignForm } from "./CampaignForm";
import { GrowBar } from "./Motion";

/** Everything waiting on the climber, with a link to each. */
export function ApprovalQueue({ items }: { items: { label: [one: string, many: string]; count: number; href: string }[] }) {
  const waiting = items.filter((i) => i.count > 0);
  const total = waiting.reduce((sum, i) => sum + i.count, 0);
  return (
    <section className="card approvals" aria-label="Approval queue">
      <div className="row between">
        <h3>Approval queue</h3>
        <span className={`approvals-count${total > 0 ? " on" : ""}`}>{total === 0 ? "All clear" : `${total} waiting`}</span>
      </div>
      {waiting.length === 0 ? (
        <p className="muted small">Nothing needs you right now. Ideas, bounties, collab invites, reward redemptions and scout pitches show up here.</p>
      ) : (
        <ul className="approvals-list">
          {waiting.map((i) => (
            <li key={i.href}>
              <a href={i.href}>
                <span className="mono">{i.count}</span> {i.count === 1 ? i.label[0] : i.label[1]}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The running campaign with its progress, or a form to start one, plus past ones. */
export function CampaignPanel({ user }: { user: User }) {
  const active = activeCampaign(user.id);
  const past = campaignsOf(user.id).filter((c) => c.endedAt).slice(0, 4);
  const stats = active ? campaignStats(active) : undefined;
  const pct = active && stats && active.goalMicro > 0 ? Math.min(100, (stats.raisedMicro / active.goalMicro) * 100) : 0;
  return (
    <section className="card campaign" id="campaign">
      <h3>Campaign</h3>
      {active && stats ? (
        <>
          <p className="campaign-name">{active.name}</p>
          <p className="muted small">
            Every challenge you open joins it until you end it. {stats.challenges} {stats.challenges === 1 ? "challenge" : "challenges"} so far, {stats.completed} completed,{" "}
            {stats.live} live, {stats.planters} {stats.planters === 1 ? "planter" : "planters"}.
          </p>
          <div className="campaign-figures">
            <div>
              <span className="mono big">{formatUsd(stats.raisedMicro)}</span>
              <span className="muted small">{active.goalMicro > 0 ? ` of ${formatUsd(active.goalMicro)} raised` : " raised"}</span>
            </div>
            <div>
              <span className="mono">{formatUsd(stats.earnedMicro)}</span>
              <span className="muted small"> paid to you</span>
            </div>
          </div>
          {active.goalMicro > 0 && <GrowBar pct={pct} label={`${Math.round(pct)}% of the campaign target`} duration={2200} />}
          <div className="row" style={{ marginTop: 14 }}>
            <ActionButton action={endCampaignAction.bind(null, active.id)} variant="ghost" confirm="End this campaign? Open challenges stay open; new ones won't join it.">
              End campaign
            </ActionButton>
          </div>
        </>
      ) : (
        <>
          <p className="muted small">Group a run of challenges under one name and target, like a week-long climb or a charity drive. Planters see it on your page.</p>
          <CampaignForm />
        </>
      )}
      {past.length > 0 && (
        <ul className="campaign-past">
          {past.map((c) => {
            const s = campaignStats(c);
            return (
              <li key={c.id}>
                <span>{c.name}</span>
                <span className="muted small">
                  {s.completed} of {s.challenges} completed · <span className="mono">{formatUsd(s.raisedMicro)}</span> raised
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const KIND: Record<PayoutRow["kind"], string> = { completed: "Completed", upfront: "Up front", gift: "Tip", guest: "Collab", request: "Request" };

/** What the climber has been paid, each with its receipt. */
export function PayoutsPanel({ user }: { user: User }) {
  const { rows, totalMicro } = payoutsFor(user);
  return (
    <section className="card payouts" id="payouts">
      <div className="row between">
        <h3>Payouts</h3>
        <span className="muted small">
          <span className="mono">{formatUsd(totalMicro)}</span> paid to you in all
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="muted small">Nothing paid yet. Completed pots, up-front shares, collab shares and gifts land here with their receipts.</p>
      ) : (
        <table className="payout-table">
          <thead>
            <tr>
              <th>When</th>
              <th>What</th>
              <th>Type</th>
              <th className="num">Amount</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.kind}-${r.at}-${i}`}>
                <td className="muted">{new Date(r.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                <td>{r.href ? <Link href={r.href}>{r.label}</Link> : r.label}</td>
                <td>
                  <span className="tag tag-quiet">{KIND[r.kind]}</span>
                </td>
                <td className="num mono">{formatUsd(r.amountMicro)}</td>
                <td>
                  {r.tx && !isSimTx(r.tx) ? (
                    <a href={explorerTxUrl(r.tx)} target="_blank" rel="noreferrer">
                      Explorer
                    </a>
                  ) : (
                    <span className="muted small">{r.tx ? "Rehearsal" : "—"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
