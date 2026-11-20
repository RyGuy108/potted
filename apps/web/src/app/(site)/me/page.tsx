import Link from "next/link";
import { Avatar } from "@/components/StreamHeader";
import { formatUsd } from "@potted/core";
import { redirect } from "next/navigation";
import { AccountBento } from "@/components/AccountBento";
import { Beanstalk } from "@/components/Beanstalk";
import type { MagicBentoItem } from "@/components/MagicBento";
import { Wallet } from "@/components/Wallet";
import { forYou } from "@/lib/discover";
import { gameOf } from "@/lib/format";
import { climberBoard, planterBoard } from "@/lib/leaderboard";
import { unreadCount } from "@/lib/notifications";
import { allPointsOf, redemptionsFor } from "@/lib/points";
import { scoutOf } from "@/lib/scout";
import {
  activeCampaign,
  bountiesBackedBy,
  campaignStats,
  disputesWaiting,
  invitesFor,
  listChallenges,
  liveStreams,
  openBounties,
  payoutsFor,
  pendingSuggestions,
  gardenOf,
  planterStats,
} from "@/lib/service";
import { currentUser } from "@/lib/session";

const DAY = 24 * 60 * 60_000;

/** Your account: one tile for everything that's yours, each leading to its page. Different for planters, climbers and keepers. */
export default async function Me() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.onboarded === false) redirect("/welcome");
  const items = user.role === "streamer" ? climberTiles(user) : user.role === "mod" ? keeperTiles() : planterTiles(user);
  const unread = unreadCount(user);
  return (
    <>
      <div className="row between wrap me-head">
        <div>
          <p className="eyebrow">{user.role === "streamer" ? "Climber" : user.role === "mod" ? "Keeper" : "Planter"}</p>
          <div className="account-profile-heading"><Avatar name={user.name} handle={user.id} src={user.profile?.avatarUrl} size={64} /><div><h1>{user.name}</h1>{user.profile?.bio && <p className="muted">{user.profile.bio}</p>}</div></div>
          {unread > 0 && <p className="muted">{unread} new {unread === 1 ? "notification" : "notifications"} in the bell above.</p>}
        </div>
        <div className="row wrap"><Link href="/settings" className="btn btn-ghost">Edit profile & settings</Link><Wallet user={user} /></div>
      </div>
      <AccountBento items={[
        { id: "settings", label: "Your account", title: "Profile & settings", description: "Photo, bio, connected accounts and preferences", href: "/settings", visual: <AccountTileIcon kind="settings" />, colSpan: user.role === "streamer" ? 1 : 2 },
        ...(user.role === "streamer" ? [{ id: "channel", label: "Channel", title: "Links, rewards and settings", description: "Overlay, channel points and stream settings", href: "/dashboard/channel", visual: <AccountTileIcon kind="channel" /> }] : []),
        ...items,
      ]} />
    </>
  );
}

function Big({ children, small }: { children: React.ReactNode; small?: React.ReactNode }) {
  return (
    <div className="bento-big">
      <span className="mono">{children}</span>
      {small && <span className="muted small">{small}</span>}
    </div>
  );
}

function planterTiles(user: NonNullable<Awaited<ReturnType<typeof currentUser>>>): MagicBentoItem[] {
  const stats = planterStats(user);
  const live = liveStreams();
  const pick = forYou(user, live, 1)[0];
  const row = planterBoard().find((r) => r.user.id === user.id);
  const requests = bountiesBackedBy(user).filter((r) => r.bounty.status === "open");
  const points = allPointsOf(user).reduce((sum, p) => sum + p.balance, 0);
  const next = stats.level.next;
  const progress = next ? (stats.xp - stats.level.floor) / (next.at - stats.level.floor) : 1;
  // What's still growing: challenges they backed that haven't settled, biggest pots first.
  const growing = gardenOf(user)
    .plots.filter((p) => p.challenge.status === "open" || p.challenge.status === "locked")
    .sort((a, b) => b.challenge.totalMicro - a.challenge.totalMicro);
  const nextBadge = stats.badges.find((b) => !b.earned);
  return [
    {
      id: "garden",
      label: "My garden",
      title: stats.level.name,
      description: `${stats.backed} backed · ${stats.grown} completed · ${stats.badges.filter((b) => b.earned).length} badges`,
      href: "/garden",
      colSpan: 2,
      rowSpan: 2,
      visual: (
        <div className="bento-garden-wrap">
          {growing.length > 0 ? (
            <div className="bento-growing">
              <span className="eyebrow">Growing now · {growing.length}</span>
              {growing.slice(0, 2).map((p) => {
                const goal = p.challenge.goalMicro;
                const pct = goal > 0 ? Math.min(100, (p.challenge.totalMicro / goal) * 100) : 100;
                return (
                  <span key={p.challenge.id} className="bento-growing-row">
                    <span className="bento-growing-name">
                      <b>{p.streamerName}</b> {p.challenge.title.replace(/^[^:]{1,20}:\s*/, "")}
                    </span>
                    <span className="mono small">{formatUsd(p.challenge.totalMicro)}</span>
                    <span className="bento-mini-bar" aria-hidden="true">
                      <span style={{ width: `${Math.max(4, pct)}%` }} />
                    </span>
                  </span>
                );
              })}
            </div>
          ) : nextBadge ? (
            <div className="bento-growing">
              <span className="eyebrow">Next badge</span>
              <span className="bento-growing-row">
                <span className="bento-growing-name">
                  <b>{nextBadge.name}</b> {nextBadge.how}
                </span>
              </span>
            </div>
          ) : null}
        <div className="bento-garden">
          <Beanstalk stage={Math.min(4, stats.level.index)} size={growing.length > 0 || nextBadge ? 104 : 132} />
          <div className="bento-garden-xp">
            <span className="mono">{stats.xp.toLocaleString("en-US")} XP</span>
            <span className="bento-bar">
              <span style={{ width: `${Math.max(4, progress * 100)}%` }} />
            </span>
            <span className="muted small">{next ? `${(next.at - stats.xp).toLocaleString("en-US")} XP to ${next.name}` : "Top level"}</span>
          </div>
        </div>
        </div>
      ),
    },
    {
      id: "live",
      label: "Browse",
      title: `${live.length} ${live.length === 1 ? "stream" : "streams"} live`,
      description: `${formatUsd(live.reduce((s, l) => s + l.potMicro, 0))} in live pots right now`,
      href: "/browse",
      colSpan: 2,
      visual: (
        <div className="bento-faces">
          {live.slice(0, 6).map((l) => (
            <span key={l.streamer.id} className="bento-face" title={l.streamer.name}>
              {l.streamer.name.charAt(0).toUpperCase()}
            </span>
          ))}
        </div>
      ),
    },
    {
      id: "surprise",
      label: "Surprise me",
      title: "Find someone new",
      description: "A live creator you haven't backed yet",
      href: "/browse/random",
      visual: <DiceArt />,
    },
    {
      id: "rank",
      label: "Leaderboard",
      title: row ? `#${row.rank} of ${planterBoard().length}` : "Unranked",
      description: row ? `${row.xp.toLocaleString("en-US")} XP` : "Back a challenge to get on the board",
      href: "/leaderboard",
      visual: <Big>{row ? `#${row.rank}` : "—"}</Big>,
    },
    pick
      ? {
          id: "pick",
          label: "Picked for you",
          title: pick.headline.title,
          description: `${pick.streamer.name} · ${gameOf(pick.headline).name} · ${pick.reason}`,
          href: `/s/${pick.streamer.handle}`,
          colSpan: 2,
          visual: <Big small={`${pick.planters} planters`}>{formatUsd(pick.potMicro)}</Big>,
        }
      : {
          id: "pick",
          label: "Picked for you",
          title: "Follow a few climbers",
          description: "Streams for you show up here",
          href: "/browse",
          colSpan: 2,
        },
    {
      id: "requests",
      label: "Your requests",
      title: requests.length ? `${requests.length} waiting for an answer` : "No requests waiting",
      description: "Ask a climber for a challenge from their page",
      href: "/garden",
      visual: <Big>{requests.length}</Big>,
    },
    {
      id: "points",
      label: "Channel points",
      title: `${points.toLocaleString("en-US")} points`,
      description: "Spend them on rewards from each climber",
      href: "/garden",
      visual: <Big>{points.toLocaleString("en-US")}</Big>,
    },
  ];
}

function climberTiles(user: NonNullable<Awaited<ReturnType<typeof currentUser>>>): MagicBentoItem[] {
  const challenges = listChallenges(user.id);
  const live = challenges.filter((c) => c.status === "open" || c.status === "locked");
  const recent = challenges
    .filter((c) => c.status === "paid" || c.status === "failed")
    .sort((a, b) => (b.settledAt ?? 0) - (a.settledAt ?? 0))
    .slice(0, Math.max(0, 3 - Math.min(live.length, 3)) + 1);
  const run = scoutOf(user.id);
  const waiting =
    pendingSuggestions(user.id).length +
    openBounties(user.id).length +
    invitesFor(user).incoming.length +
    redemptionsFor(user.id).filter((r) => r.status === "pending").length;
  const pitches = run ? run.pitches.filter((_, i) => !run.opened[i]).length : 0;
  const { rows, totalMicro } = payoutsFor(user, 500);
  const now = Date.now();
  const days = Array.from({ length: 7 }, (_, i) => {
    const end = now - (6 - i) * DAY;
    return rows.filter((r) => r.at > end - DAY && r.at <= end).reduce((s, r) => s + r.amountMicro, 0);
  });
  const week = days.reduce((a, b) => a + b, 0);
  const peak = Math.max(1, ...days);
  const campaign = activeCampaign(user.id);
  const cStats = campaign ? campaignStats(campaign) : undefined;
  const row = climberBoard().find((r) => r.user.id === user.id);
  return [
    {
      id: "challenges",
      label: "Challenges",
      title: live.length ? `${live.length} live now` : "Nothing live",
      description: live.length ? "Start attempts, claim clips and open new ones" : "Open a challenge for your next stream",
      href: "/dashboard",
      colSpan: 2,
      rowSpan: 2,
      visual: (
        <ul className="bento-live">
          {live.slice(0, 3).map((c) => (
            <li key={c.id}>
              <span className="bento-live-title">{c.title}</span>
              <span className="bento-bar">
                <span style={{ width: `${c.goalMicro > 0 ? Math.min(100, Math.max(4, (c.totalMicro / c.goalMicro) * 100)) : 100}%` }} />
              </span>
              <span className="mono small">{formatUsd(c.totalMicro)}</span>
            </li>
          ))}
          {live.length === 0 && <li className="muted small">Your live challenges and their pots show here.</li>}
          {recent.length > 0 && <li className="bento-sub">Recently finished</li>}
          {recent.map((c) => (
            <li key={c.id} className="bento-done">
              <span className="bento-live-title">{c.title}</span>
              <span className={`bento-result ${c.status === "paid" ? "won" : ""}`}>{c.status === "paid" ? "Completed" : "Refunded"}</span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: "waiting",
      label: "Waiting on you",
      title: waiting ? `${waiting} to answer` : "All clear",
      description: "Ideas, funded requests, invites, rewards",
      href: "/dashboard",
      visual: <Big>{waiting}</Big>,
    },
    {
      id: "scout",
      label: "Grok scout",
      title: pitches ? `${pitches} pitches ready` : "Find new challenges",
      description: "Ideas from what your chat and X are talking about",
      href: "/dashboard#scout",
      visual: <Big>{pitches}</Big>,
    },
    {
      id: "earnings",
      label: "Payouts",
      title: `${formatUsd(week)} this week`,
      description: `${formatUsd(totalMicro)} paid to you in all`,
      href: "/dashboard/channel#payouts",
      colSpan: 2,
      visual: (
        <div className="bento-week" aria-hidden="true">
          {days.map((d, i) => (
            <span key={i} style={{ height: `${Math.max(6, (d / peak) * 100)}%` }} className={d === peak && d > 0 ? "peak" : undefined} />
          ))}
        </div>
      ),
    },
    {
      id: "campaign",
      label: "Campaign",
      title: campaign ? campaign.name : "No campaign running",
      description: campaign && cStats ? `${formatUsd(cStats.raisedMicro)}${campaign.goalMicro ? ` of ${formatUsd(campaign.goalMicro)}` : ""} raised` : "Group a run of challenges under one goal",
      href: "/dashboard/channel#campaign",
      visual: campaign && cStats && campaign.goalMicro ? <Big>{Math.round(Math.min(100, (cStats.raisedMicro / campaign.goalMicro) * 100))}%</Big> : <Big>—</Big>,
    },
    {
      id: "page",
      label: "Your stream page",
      title: `/s/${user.handle}`,
      description: "See it the way your fans do",
      href: `/s/${user.handle}`,
      visual: <Big>{user.name.charAt(0).toUpperCase()}</Big>,
    },
    {
      id: "analytics",
      label: "Analytics",
      title: row && row.completionRate !== null ? `${Math.round(row.completionRate * 100)}% completed` : "No results yet",
      description: row ? `${row.planters} planters have backed you` : "Your numbers after your first challenge",
      href: "/analytics",
      visual: <Big>{row ? row.planters : 0}</Big>,
    },
    {
      id: "rank",
      label: "Leaderboard",
      title: row ? `#${row.rank} of ${climberBoard().length} climbers` : "Unranked",
      description: "Ranked by what you've been paid",
      href: "/leaderboard?board=climbers",
      visual: <Big>{row ? `#${row.rank}` : "—"}</Big>,
    },
    {
      id: "overlay",
      label: "Overlay",
      title: "Preview your overlay",
      description: "The OBS browser source, on a dark background",
      href: `/overlay/${user.handle}?bg=1&muted=1`,
      visual: <OverlayArt />,
    },
    {
      id: "record",
      label: "On-chain record",
      title: "Every payout and refund",
      description: "Receipts from the escrow program",
      href: "/activity",
      visual: <Big>{challenges.filter((c) => c.settledAt).length}</Big>,
    },
  ];
}

function keeperTiles(): MagicBentoItem[] {
  const disputes = disputesWaiting();
  const live = liveStreams();
  return [
    {
      id: "reviews",
      label: "Reviews",
      title: disputes.length ? `${disputes.length} ${disputes.length === 1 ? "clip needs" : "clips need"} a ruling` : "Nothing needs a ruling",
      description: "Watch the clip, read the terms, rule",
      href: "/reviews",
      colSpan: 2,
      rowSpan: 2,
      visual: <Big>{disputes.length}</Big>,
    },
    {
      id: "live",
      label: "Browse",
      title: `${live.length} streams live`,
      description: "Clips can be disputed while their window is open",
      href: "/browse",
      colSpan: 2,
    },
    { id: "activity", label: "On-chain record", title: "Every settlement", description: "Receipts for every payout and refund", href: "/activity", colSpan: 2 },
  ];
}

function DiceArt() {
  return (
    <svg className="bento-dice" viewBox="0 0 64 64" aria-hidden="true">
      <rect x="10" y="10" width="44" height="44" rx="12" fill="none" stroke="currentColor" strokeWidth="2.5" />
      {[
        [22, 22],
        [42, 22],
        [32, 32],
        [22, 42],
        [42, 42],
      ].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="3.6" fill="currentColor" />
      ))}
    </svg>
  );
}

function OverlayArt() {
  return (
    <svg className="bento-overlay" viewBox="0 0 120 70" aria-hidden="true">
      <rect x="1" y="1" width="118" height="68" rx="8" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      <rect x="10" y="46" width="62" height="14" rx="4" fill="currentColor" fillOpacity="0.18" />
      <rect x="10" y="46" width="40" height="14" rx="4" fill="#3ecf8e" />
      <circle cx="102" cy="16" r="5" fill="#e5484d" />
    </svg>
  );
}

function AccountTileIcon({ kind }: { kind: "settings" | "channel" }) {
  return (
    <svg className="account-tile-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === "settings" ? (
        <>
          <path d="M10 2h4l.6 2.6 1.4.8 2.6-.8 2 3.4-1.9 1.9v1.7l1.9 1.9-2 3.4-2.6-.8-1.4.8L14 20h-4l-.6-2.6-1.4-.8-2.6.8-2-3.4 1.9-1.9v-1.7L3.4 8.5l2-3.4 2.6.8 1.4-.8L10 2Z" transform="translate(0 1)" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <rect x="2" y="5" width="20" height="14" rx="4" />
          <path d="m10 9 5 3-5 3Z" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  );
}
