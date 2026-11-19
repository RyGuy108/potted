import { type Challenge, GAMES, toUsd } from "@potted/core";
import { forYou, trending } from "./discover";
import { gameOf } from "./format";
import * as service from "./service";
import { extToken, readExtToken } from "./session";
import { give } from "./gifts";
import { pointsConfig, pointsOf, redeem, redemptionsFor, resolveRedemption } from "./points";
import { SAMPLE_SIGN_INS } from "./sample-data";
import { TEST_ACCOUNTS } from "./test-accounts";
import { demoAccountsOn } from "./demo-mode";
import { twitchChannel } from "./twitch";
import { DEMO_GUEST_ID, DEMO_STREAMER_ID, type LiveSession, type User } from "./store";
import { POT_FIELDS, conditionFromFields, termFields } from "./terms";

/**
 * The JSON API the browser extension talks to. It is a thin layer over the
 * same service functions the website uses, so every rule (who may lock,
 * pledge limits, refunds) is enforced in one place. Requests carry a signed
 * token, never a cookie.
 */

export interface ApiResult {
  status: number;
  json: unknown;
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const ok = (json: unknown): ApiResult => ({ status: 200, json });

function viewOf(challenge: Challenge, viewer: User | undefined) {
  const mine = viewer ? service.pledgesFor(challenge.id).filter((p) => p.userId === viewer.id).reduce((sum, p) => sum + p.amountMicro, 0) : 0;
  const clip = challenge.condition.kind === "optimistic";
  return {
    id: challenge.id,
    title: challenge.title,
    game: gameOf(challenge).name,
    status: challenge.status,
    totalMicro: challenge.totalMicro,
    goalMicro: challenge.goalMicro,
    pledgeCapMicro: challenge.pledgeCapMicro,
    deadline: challenge.deadline,
    mineMicro: mine,
    planters: service.fundersOf(challenge.id).length,
    owner: viewer?.id === challenge.streamerId,
    /** The streamer still has to post a clip for this one to settle. */
    needsClip: clip && challenge.status === "locked" && !challenge.claim,
    clipPosted: Boolean(challenge.claim),
    clipUrl: challenge.claim?.clipUrl ?? null,
    /** When an undisputed clip settles. */
    disputeEndsAt: challenge.claim && challenge.condition.kind === "optimistic" ? challenge.claim.claimedAt + challenge.condition.disputeWindowSecs * 1000 : null,
    disputedByMe: Boolean(viewer && challenge.claim?.disputedBy.includes(viewer.id)),
    /** A funder can dispute a posted clip until a keeper rules. */
    canDispute: Boolean(mine > 0 && challenge.status === "locked" && challenge.claim && !challenge.claim.ruling && !challenge.claim.disputedBy.includes(viewer!.id)),
    note: challenge.verdict?.reason ?? null,
    splits: [
      ...(challenge.splits ?? []).map((s) => `${s.kind === "guest" ? "Collab with" : "For"} ${s.name} · ${s.pct}%`),
      ...(challenge.upfrontPct ? [`${challenge.upfrontPct}% paid when the attempt starts; the rest only on completion`] : []),
    ],
  };
}

const PLATFORMS = { twitch: "Twitch", youtube: "YouTube", kick: "Kick" } as const;

function sessionView(s: LiveSession) {
  return { platform: s.platform, platformName: PLATFORMS[s.platform], url: s.url, title: s.title ?? null, game: s.customGame ?? (s.gameId === "other" ? null : (GAMES.find((g) => g.id === s.gameId)?.name ?? null)), startedAt: s.startedAt };
}

/** Where to watch a climber, when they said they're live. */
function watchOf(streamer: User) {
  const s = service.liveSessionOf(streamer);
  return s ? sessionView(s) : null;
}

function userView(user: User) {
  return { id: user.id, name: user.name, role: user.role, handle: user.handle ?? null };
}

export async function handleExt(method: string, path: string[], query: URLSearchParams, body: Record<string, unknown>, token: string | null): Promise<ApiResult> {
  try {
    return await route(method, path, query, body, service.getUser(readExtToken(token)));
  } catch (error) {
    if (error instanceof ApiError) return { status: error.status, json: { error: error.message } };
    // Service errors are written for people: wrong role, over the limit, already settled.
    return { status: 400, json: { error: error instanceof Error ? error.message : "Something went wrong" } };
  }
}

async function route(method: string, path: string[], query: URLSearchParams, body: Record<string, unknown>, user: User | undefined): Promise<ApiResult> {
  const [head, id, action] = path;
  const need = (): User => user ?? fail(401, "Connect your Potted account first");
  const climber = (): User => {
    const me = need();
    if (me.role !== "streamer") fail(403, "Only climbers can do that");
    return me;
  };
  const key = `${method} ${head}${id ? "/:id" : ""}${action ? `/${action}` : ""}`;

  switch (key) {
    case "GET config":
      return ok({
        games: GAMES.map((g) => ({ id: g.id, name: g.name, how: g.how, featured: Boolean(g.featured), fields: termFields(g.id) })),
        potFields: POT_FIELDS,
        rehearsal: service.simulatedResultsAllowed(),
        // Ready-made planters from the demo sample, when it is loaded.
        samples: (demoAccountsOn() ? [...TEST_ACCOUNTS.map((t) => ({ id: t.id, label: t.name, role: t.role, note: t.note })), ...SAMPLE_SIGN_INS]
          .filter((s) => service.getUser(s.id))
          .map((s) => ({ id: s.id, label: s.label, note: s.note, role: s.role })) : []),
      });

    case "POST demo": {
      // The same ready-made accounts the website's demo sign-in offers.
      if (!demoAccountsOn()) fail(403, "Demo accounts are off on this server. Sign in on the website instead.");
      const as = String(body.as);
      const who =
        as === "ryan"
          ? service.getUser(DEMO_STREAMER_ID)
          : as === "kai"
            ? service.getUser(DEMO_GUEST_ID)
            : as === "planter" || as === "keeper"
              ? await service.signIn(String(body.name ?? ""), as === "keeper" ? "mod" : "fan")
              : [...SAMPLE_SIGN_INS, ...TEST_ACCOUNTS].some((s) => s.id === as)
                ? service.getUser(as)
                : undefined;
      if (!who) fail(400, "Unknown demo account");
      return ok({ token: extToken(who.id), user: userView(who) });
    }

    case "GET me": {
      const me = need();
      return ok({ user: userView(me), balanceMicro: await service.balanceOf(me) });
    }

    case "GET stream": {
      const handle = query.get("handle");
      const platform = query.get("platform");
      const streamer = handle
        ? service.getStreamer(handle)
        : platform === "twitch" || platform === "youtube" || platform === "kick"
          ? service.streamerByChannel(platform, query.get("channel") ?? "")
          : undefined;
      if (!streamer) return ok({ streamer: null, challenges: [] });
      await service.tick(streamer.id);
      const settings = service.settingsOf(streamer);
      const points = pointsConfig(streamer.id);
      const twitch = settings.twitchChannel ? await twitchChannel(settings.twitchChannel) : null;
      return ok({
        streamer: { name: streamer.name, handle: streamer.handle, avatarUrl: twitch?.profileImageUrl ?? null, live: Boolean(twitch?.live || service.liveSessionOf(streamer)) },
        watch: watchOf(streamer),
        points: points.on
          ? {
              perUsd: points.perUsd,
              balance: user?.role === "fan" ? pointsOf(user, streamer.id).balance : null,
              rewards: points.rewards.filter((r) => r.enabled).map((r) => ({ id: r.id, title: r.title, cost: r.cost, note: r.note, needsInput: r.needsInput })),
            }
          : null,
        minPledgeUsd: settings.minPledgeUsd,
        acceptingIdeas: settings.acceptingSuggestions,
        // Games this climber has run, so an idea starts on something they play.
        games: [...new Set(service.listChallenges(streamer.id).map((c) => c.gameId))].slice(0, 6),
        cause: settings.causeOn ? { name: settings.causeName, pct: settings.causePct } : null,
        topPlanters: service.topPlanters(streamer.id, 5).map((t) => ({ name: t.name, amountMicro: t.amountMicro, challenges: t.challenges, you: t.userId === user?.id })),
        challenges: service
          .stageChallenges(streamer.id)
          .filter((c) => c.status === "open" || c.status === "locked")
          .map((c) => viewOf(c, user)),
      });
    }

    case "GET live": {
      // The browse lists the website shows: For you (signed-in planters), Trending, and everyone live by pot size.
      const live = service.liveStreams();
      const card = (l: service.StreamListing, reason = "") => ({
        handle: l.streamer.handle,
        name: l.streamer.name,
        title: l.headline.title,
        game: gameOf(l.headline).name,
        potMicro: l.potMicro,
        planters: l.planters,
        charity: l.charity,
        platform: l.session?.platform ?? null,
        reason,
      });
      return ok({
        forYou: user?.role === "fan" ? forYou(user, live, 4).map((p) => card(p, p.reason)) : [],
        trending: trending(live, 4).map((p) => card(p, p.reason)),
        streams: [...live].sort((a, b) => b.potMicro - a.potMicro || b.planters - a.planters).map((l) => card(l)),
      });
    }

    case "GET search": {
      // Finds a climber by name, Potted handle or the Twitch or YouTube channel being watched.
      const q = (query.get("q") ?? "").trim().toLowerCase().replace(/^@/, "");
      if (q.length < 2) return ok({ streamers: [] });
      const live = new Map(service.liveStreams().map((l) => [l.streamer.id, l]));
      const streamers = service
        .listStreamers()
        .map((s) => {
          const settings = service.settingsOf(s);
          const names = [s.name, s.handle ?? "", settings.twitchChannel ?? "", settings.youtubeChannel ?? ""].map((n) => n.toLowerCase());
          const rank = names.some((n) => n === q) ? 0 : names.some((n) => n.startsWith(q)) ? 1 : names.some((n) => n.includes(q)) ? 2 : -1;
          const l = live.get(s.id);
          return { rank, row: { handle: s.handle, name: s.name, twitch: settings.twitchChannel || null, live: Boolean(l), title: l?.headline.title ?? null, potMicro: l?.potMicro ?? 0 } };
        })
        .filter((x) => x.rank >= 0 && x.row.handle)
        .sort((a, b) => a.rank - b.rank || Number(b.row.live) - Number(a.row.live) || b.row.potMicro - a.row.potMicro)
        .slice(0, 8)
        .map((x) => x.row);
      return ok({ streamers });
    }

    // --- Climbers: what they need mid-stream, the rest stays on the website ---

    case "GET channel": {
      const me = climber();
      const settings = service.settingsOf(me);
      return ok({
        watch: watchOf(me),
        announcer: settings.announcer,
        fanPage: `/s/${me.handle}`,
        overlay: `/overlay/${me.handle}`,
        redemptions: redemptionsFor(me.id)
          .filter((r) => r.status === "pending")
          .map((r) => ({ id: r.id, title: r.title, input: r.input, fanName: r.fanName, cost: r.cost, at: r.at })),
        ideas: service.pendingSuggestions(me.id).map((s) => ({ id: s.id, fanName: s.fanName, text: s.text, game: s.customGame ?? GAMES.find((g) => g.id === s.gameId)?.name ?? "" })),
      });
    }

    case "POST golive":
      return ok({ watch: sessionView(await service.goLive(climber(), String(body.link ?? ""))) });

    case "POST endstream":
      service.endStream(climber());
      return ok({ watch: null });

    case "POST announcer": {
      const me = climber();
      const settings = await service.updateSettings(me, { ...service.settingsOf(me), announcer: body.on === true });
      return ok({ announcer: settings.announcer });
    }

    case "POST redemptions/:id":
      await resolveRedemption(climber(), id!, body.outcome === "refunded" ? "refunded" : "fulfilled");
      return ok({ done: true });

    case "POST ideas/:id/dismiss":
      await service.resolveSuggestion(climber(), id!, "dismissed");
      return ok({ done: true });

    // --- Keepers: disputed clips to rule on ---

    case "GET reviews": {
      const me = need();
      if (me.role !== "mod") fail(403, "Reviews are for keepers");
      return ok({
        cases: service.disputesWaiting().map((c) => ({
          id: c.id,
          title: c.title,
          game: gameOf(c).name,
          streamer: service.getUser(c.streamerId)?.name ?? "A climber",
          totalMicro: c.totalMicro,
          planters: service.fundersOf(c.id).length,
          clipUrl: c.claim?.clipUrl ?? null,
          disputes: c.claim?.disputedBy.length ?? 0,
          claimedAt: c.claim?.claimedAt ?? null,
        })),
      });
    }

    case "POST challenges/:id/rule":
      return ok(viewOf(await service.rule(need(), id!, body.upheld === true), user));

    case "GET garden": {
      const me = need();
      if (me.role !== "fan") fail(403, "The garden is for planters");
      const stats = service.planterStats(me);
      const garden = service.gardenOf(me);
      return ok({
        balanceMicro: await service.balanceOf(me),
        level: stats.level,
        xp: stats.xp,
        streakDays: stats.streakDays,
        backed: stats.backed,
        grown: stats.grown,
        streamersBacked: stats.streamersBacked,
        pledgedMicro: garden.pledgedMicro,
        returnedMicro: garden.returnedMicro,
        badges: stats.badges,
        activity: service.planterActivity(me, 8).map((a) => ({ at: a.at, kind: a.kind, text: a.text, title: a.challenge.title, id: a.challenge.id })),
      });
    }

    case "POST give": {
      const g = await give(need(), String(body.handle ?? ""), Number(body.amountUsd), String(body.note ?? ""));
      return ok({ id: g.id, amountMicro: g.amountMicro });
    }

    case "POST redeem": {
      const r = await redeem(need(), String(body.handle ?? ""), String(body.rewardId ?? ""), String(body.input ?? ""));
      return ok({ id: r.id, title: r.title });
    }

    case "POST challenges/:id/dispute":
      return ok(viewOf(await service.dispute(need(), id!), user));

    case "POST ideas": {
      const me = need();
      const idea = await service.suggest(me, String(body.handle ?? ""), String(body.gameId ?? ""), String(body.text ?? ""), String(body.customGame ?? ""));
      return ok({ id: idea.id });
    }

    case "GET mine": {
      const me = need();
      if (me.role !== "streamer") fail(403, "Only climbers run challenges");
      await service.tick(me.id);
      const all = service.listChallenges(me.id);
      return ok({
        live: all.filter((c) => c.status === "open" || c.status === "locked").map((c) => viewOf(c, me)),
        recent: all.filter((c) => c.status === "paid" || c.status === "failed").slice(0, 5).map((c) => viewOf(c, me)),
      });
    }

    case "POST challenges": {
      const me = need();
      const gameId = String(body.gameId);
      const fields = (typeof body.fields === "object" && body.fields !== null ? body.fields : {}) as Record<string, string>;
      const created = await service.createChallenge(me, {
        gameId,
        condition: conditionFromFields(gameId, fields),
        goalUsd: Number(fields.goalUsd),
        pledgeCapUsd: Number(fields.pledgeCapUsd),
        minutes: Number(fields.minutes),
        upfrontPct: Number(fields.upfrontPct ?? 0),
      });
      return ok(viewOf(created, me));
    }

    case "POST challenges/:id/pledge": {
      const me = need();
      await service.pledge(me, id!, Number(body.amountUsd));
      return ok(viewOf(service.getChallenge(id!), me));
    }
    case "POST challenges/:id/lock":
      return ok(viewOf(await service.lock(need(), id!), user));
    case "POST challenges/:id/cancel":
      return ok(viewOf(await service.cancel(need(), id!), user));
    case "POST challenges/:id/claim":
      return ok(viewOf(await service.claim(need(), id!, String(body.clipUrl ?? "")), user));
    case "POST challenges/:id/check": {
      const me = need();
      if (service.getChallenge(id!).streamerId !== me.id) fail(403, "Only this challenge's climber can check it");
      return ok(viewOf(await service.check(id!, { force: true }), me));
    }
    case "POST challenges/:id/simulate":
      return ok(viewOf(await service.simulateResult(need(), id!, body.success === true), user));
  }
  return fail(404, "No such endpoint");
}

function fail(status: number, message: string): never {
  throw new ApiError(status, message);
}

/** Dollars for display in tests and logs. */
export const usd = toUsd;
