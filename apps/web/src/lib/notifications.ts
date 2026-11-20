import { type Challenge, formatUsd } from "@potted/core";
import * as service from "./service";
import { twitchChannel } from "./twitch";
import { type EventType, type Notice, type NoticeKind, type Redemption, type User, db, newId, save } from "./store";

/**
 * In-app notifications. They come from the same moments that drive the
 * overlay (a challenge opened, a pledge, a start, a clip, a result) plus a
 * few of their own: follows, ideas, invites, redemptions and awards. Each
 * person only hears about what is theirs: planters about challenges they
 * backed and climbers they follow, climbers about their own stream, keepers
 * about disputes.
 */

/** Notices kept per person; older ones drop off. */
const KEEP = 60;

export function notify(userId: string, kind: NoticeKind, title: string, body: string, href: string): void {
  if (!userId) return;
  const state = db();
  const prefs = state.users.find(u => u.id === userId)?.profile?.notifications;
  if (kind === "award" && prefs?.awards === false) return;
  if (["challenge", "follow", "idea", "invite"].includes(kind) && prefs?.community === false) return;
  const list = (state.notices ??= []);
  list.push({ id: newId("n"), userId, at: Date.now(), kind, title, body, href, read: false });
  const mine = list.filter((n) => n.userId === userId);
  if (mine.length > KEEP) {
    const drop = new Set(mine.slice(0, mine.length - KEEP).map((n) => n.id));
    state.notices = list.filter((n) => !drop.has(n.id));
  }
}

export function noticesFor(user: User, limit = 25): Notice[] {
  return (db().notices ?? [])
    .filter((n) => n.userId === user.id)
    .slice(-limit)
    .reverse();
}

export function unreadCount(user: User): number {
  return (db().notices ?? []).filter((n) => n.userId === user.id && !n.read).length;
}

export function markRead(user: User, ids?: string[]): void {
  let changed = false;
  for (const n of db().notices ?? []) {
    if (n.userId !== user.id || n.read || (ids && !ids.includes(n.id))) continue;
    n.read = true;
    changed = true;
  }
  if (changed) save();
}

// --- Following -------------------------------------------------------------

export function isFollowing(fan: User, streamerId: string): boolean {
  return (db().follows ?? []).some((f) => f.fanId === fan.id && f.streamerId === streamerId);
}

export function followersOf(streamerId: string): string[] {
  return (db().follows ?? []).filter((f) => f.streamerId === streamerId).map((f) => f.fanId);
}

export function followingOf(fan: User): User[] {
  return (db().follows ?? []).filter((f) => f.fanId === fan.id).flatMap((f) => service.getUser(f.streamerId) ?? []);
}

export async function setFollow(actor: User, handle: string, on: boolean): Promise<boolean> {
  if (actor.role !== "fan") throw new Error("Sign in as a planter to follow climbers");
  const streamer = service.getStreamer(handle) ?? (() => {
    throw new Error("Streamer not found");
  })();
  const state = db();
  const follows = (state.follows ??= []);
  const already = isFollowing(actor, streamer.id);
  if (on && !already) {
    follows.push({ fanId: actor.id, streamerId: streamer.id, at: Date.now() });
    notify(streamer.id, "follow", `${actor.name} followed you`, "They'll hear when you open a challenge.", `/s/${streamer.handle}`);
  }
  if (!on && already) state.follows = follows.filter((f) => !(f.fanId === actor.id && f.streamerId === streamer.id));
  save();
  return on;
}

// --- Awards ---------------------------------------------------------------

/** Climber milestones, checked against their analytics. */
const MILESTONES: { id: string; name: string; reached: (s: service.ClimberStats) => boolean }[] = [
  { id: "first-complete", name: "First challenge completed", reached: (s) => s.completed >= 1 },
  { id: "five-complete", name: "Five challenges completed", reached: (s) => s.completed >= 5 },
  { id: "ten-complete", name: "Ten challenges completed", reached: (s) => s.completed >= 10 },
  { id: "earned-50", name: "$50 earned", reached: (s) => s.earnedMicro >= 50_000_000 },
  { id: "earned-250", name: "$250 earned", reached: (s) => s.earnedMicro >= 250_000_000 },
  { id: "earned-1000", name: "$1,000 earned", reached: (s) => s.earnedMicro >= 1_000_000_000 },
  { id: "planters-10", name: "10 planters backed you", reached: (s) => s.planters >= 10 },
  { id: "planters-25", name: "25 planters backed you", reached: (s) => s.planters >= 25 },
  { id: "raised-25", name: "$25 raised for a cause", reached: (s) => s.raisedMicro >= 25_000_000 },
];

/**
 * Announces badges, levels and milestones someone has newly reached. The
 * first check only records what they already have, so nobody is flooded
 * with awards they earned before notifications existed.
 */
export function checkAwards(user: User | undefined): void {
  if (!user) return;
  if (user.role === "fan") {
    const stats = service.planterStats(user);
    const earned = stats.badges.filter((b) => b.earned).map((b) => b.id);
    const seen = user.awarded;
    user.awarded = { badges: earned, level: stats.level.index, milestones: seen?.milestones ?? [] };
    if (!seen) return;
    for (const badge of stats.badges.filter((b) => b.earned && !seen.badges.includes(b.id))) {
      notify(user.id, "award", `Badge earned: ${badge.name}`, `${badge.how}.`, "/garden#badges");
    }
    if (stats.level.index > seen.level) {
      notify(user.id, "award", `Level up: ${stats.level.name}`, `You reached level ${stats.level.index + 1}.${stats.level.next ? ` Next: ${stats.level.next.name}.` : ""}`, "/garden");
    }
  } else if (user.role === "streamer") {
    const stats = service.climberStats(user);
    const reached = MILESTONES.filter((m) => m.reached(stats)).map((m) => m.id);
    const seen = user.awarded;
    user.awarded = { badges: [], level: 0, milestones: reached };
    if (!seen) return;
    for (const m of MILESTONES.filter((m) => reached.includes(m.id) && !seen.milestones.includes(m.id))) {
      notify(user.id, "award", `Milestone: ${m.name}`, "See how your stream is doing.", "/analytics");
    }
  }
}

// --- From challenge events --------------------------------------------------

/** What each fan has in a challenge. */
function fundersWithAmounts(c: Challenge): Map<string, { pledged: number; returned: number }> {
  const out = new Map<string, { pledged: number; returned: number }>();
  for (const p of service.pledgesFor(c.id)) {
    const row = out.get(p.userId) ?? { pledged: 0, returned: 0 };
    row.pledged += p.amountMicro;
    row.returned += service.returnedOf(p);
    out.set(p.userId, row);
  }
  return out;
}

/** The climbers of a challenge: the host and any collab guests. */
function climbersOf(c: Challenge): User[] {
  const ids = [c.streamerId, ...(c.splits ?? []).flatMap((s) => (s.kind === "guest" && s.userId ? [s.userId] : []))];
  return ids.flatMap((id) => service.getUser(id) ?? []);
}

/** Called for every challenge event the overlay gets. Never throws: a notice failing must not stop a settlement. */
export function onChallengeEvent(type: EventType, c: Challenge, message: string): void {
  try {
    route(type, c, message);
  } catch (err) {
    console.error("Notification failed:", err);
  }
}

function route(type: EventType, c: Challenge, message: string): void {
  const href = `/c/${c.id}`;
  const climbers = climbersOf(c);
  const host = service.getUser(c.streamerId);
  const funders = fundersWithAmounts(c);
  const toFunders = (kind: NoticeKind, title: string, body: (row: { pledged: number; returned: number }) => string) => {
    for (const [fan, row] of funders) notify(fan, kind, title, body(row), href);
  };
  const toClimbers = (kind: NoticeKind, title: string, body: string) => {
    for (const climber of climbers) notify(climber.id, kind, title, body, href);
  };

  switch (type) {
    case "created": {
      // Followers of any climber on it hear once.
      const told = new Set<string>();
      for (const climber of climbers) {
        for (const fan of followersOf(climber.id)) {
          if (told.has(fan)) continue;
          told.add(fan);
          notify(fan, "challenge", `${host?.name ?? "A climber you follow"} opened a challenge`, c.title, href);
        }
      }
      break;
    }
    case "pledged": {
      const last = service.pledgesFor(c.id).at(-1);
      const fan = last ? service.getUser(last.userId) : undefined;
      if (last) toClimbers("money", `${fan?.name ?? "A planter"} added ${formatUsd(last.amountMicro)}`, `${c.title} · the pot is at ${formatUsd(c.totalMicro)}.`);
      checkAwards(fan);
      break;
    }
    case "milestone":
      toClimbers("money", "Milestone on your pot", message);
      if (c.goalMicro > 0 && c.totalMicro >= c.goalMicro) toFunders("challenge", "A pot you backed reached its goal", () => c.title);
      break;
    case "locked":
      toFunders("challenge", "The attempt has started", () => `${c.title} · pledging is closed.`);
      if (c.upfrontPaidMicro) toClimbers("money", `${formatUsd(c.upfrontPaidMicro)} paid up front`, `${c.upfrontPct}% of the pot for starting ${c.title}.`);
      break;
    case "claimed":
      toFunders("clip", "Clip posted: take a look", () => `${c.title} · dispute it if it doesn't show the challenge.`);
      break;
    case "disputed":
      toClimbers("dispute", "Your clip was disputed", `${c.title} · a keeper will review it.`);
      for (const keeper of db().users.filter((u) => u.role === "mod")) notify(keeper.id, "dispute", "A clip needs a keeper", c.title, "/reviews");
      break;
    case "paid":
      toFunders("money", "Challenge completed!", (row) => `${c.title} · your ${formatUsd(row.pledged)} helped it happen.`);
      toClimbers("money", "You completed a challenge", message);
      settleAwards(c, funders, climbers);
      break;
    case "failed":
    case "refunded": {
      const cancelled = c.verdict?.reason === "Cancelled by the streamer";
      const title = cancelled ? "Challenge cancelled: you've been refunded" : type === "refunded" ? "Time ran out: you've been refunded" : "Challenge missed: you've been refunded";
      toFunders("refund", title, (row) => `${formatUsd(row.returned)} of ${formatUsd(row.pledged)} came back · ${c.title}`);
      if (!cancelled) toClimbers("refund", "A challenge was missed", `${c.title} · pledges went back to planters.`);
      settleAwards(c, funders, climbers);
      break;
    }
    case "bounty":
      toClimbers("money", "Bounty update", message);
      break;
    default:
      break;
  }
}

function settleAwards(c: Challenge, funders: Map<string, unknown>, climbers: User[]): void {
  for (const fan of funders.keys()) checkAwards(service.getUser(fan));
  for (const climber of climbers) checkAwards(climber);
}

// --- Other moments ----------------------------------------------------------

export function onIdea(streamerId: string, fanName: string, text: string): void {
  notify(streamerId, "idea", `${fanName} suggested a challenge`, text, "/dashboard#ideas");
}

export function onInvite(guestId: string, hostName: string, title: string): void {
  notify(guestId, "invite", `${hostName} invited you to a collab`, title, "/dashboard#invites");
}

export function onInviteAnswered(hostId: string, guestName: string, accepted: boolean, title: string, challengeId?: string): void {
  notify(hostId, "invite", accepted ? `${guestName} accepted your collab` : `${guestName} declined your collab`, title, challengeId ? `/c/${challengeId}` : "/dashboard");
}

export function onRedeemed(r: Redemption, fanName: string): void {
  notify(r.streamerId, "points", `${fanName} redeemed ${r.title}`, r.input ? `"${r.input}"` : `${r.cost.toLocaleString()} points`, "/dashboard/channel#points");
}

export function onRedemptionAnswered(r: Redemption, streamerName: string, handle: string): void {
  notify(
    r.userId,
    "points",
    r.status === "fulfilled" ? `${streamerName} fulfilled ${r.title}` : `${streamerName} refunded your points`,
    r.status === "fulfilled" ? "Enjoy it." : `${r.cost.toLocaleString()} points for ${r.title} are back.`,
    `/s/${handle}#points`,
  );
}

// --- Going live on Twitch -----------------------------------------------------

/** Twitch stream start times already announced, by climber. */
const announcedLive = new Map<string, string>();

/**
 * Tells a planter's followed climbers' followers when one goes live on
 * Twitch. Checked while the planter has the site open (Twitch answers are
 * cached for a minute); each live session is announced once.
 */
export async function checkFollowedLive(fan: User): Promise<void> {
  if (fan.role !== "fan") return;
  for (const streamer of followingOf(fan)) {
    const channel = service.settingsOf(streamer).twitchChannel;
    if (!channel) continue;
    const twitch = await twitchChannel(channel);
    const started = twitch?.live?.startedAt;
    if (!started) continue;
    const key = `${streamer.id}:${started}`;
    const stored = db().liveAnnounced ?? {};
    if (announcedLive.get(streamer.id) === key || stored[streamer.id] === key) continue;
    announcedLive.set(streamer.id, key);
    (db().liveAnnounced ??= {})[streamer.id] = key;
    for (const follower of followersOf(streamer.id)) {
      notify(follower, "challenge", `${streamer.name} is live on Twitch`, twitch!.live!.title || "Come watch and back a challenge.", `/s/${streamer.handle}`);
    }
    save();
  }
}
