import { DEFAULT_BASE, getSettings, streamFromUrl, tokenFromSiteSession } from "./shared.js";

/**
 * The side panel. Planters browse, back challenges and see their garden;
 * on a linked Twitch, YouTube or Kick tab it opens that climber's stream.
 * Climbers get the mid-stream essentials of their Challenges and Channel
 * pages, and keepers get the clips waiting for a ruling. Everything else
 * stays on the website.
 *
 * The panel holds no rules of its own: every action is a call to the
 * Potted server, which decides what is allowed.
 */

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const usd = (micro) => {
  const dollars = micro / 1_000_000;
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`;
};
const timeLeft = (until) => {
  const secs = Math.max(0, Math.round((until - Date.now()) / 1000));
  if (secs < 120) return `${secs}s`;
  const mins = Math.round(secs / 60);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
};
const ago = (at) => {
  const mins = Math.round((Date.now() - at) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
};

const state = {
  base: DEFAULT_BASE,
  token: null,
  me: null,
  balanceMicro: 0,
  config: null,
  /** "stream", "browse" or "garden". */
  view: "stream",
  /** What is typed in the browse search, and what it found. */
  q: "",
  found: null,
  /** Which stream the watched tab shows, or null. */
  tab: null,
  /** A stream picked from the live list, shown instead of the tab's. */
  picked: null,
  /** Whether the idea form is open. */
  ideaOpen: false,
  /** The handle of the stream on screen, for ideas. */
  streamHandle: null,
  /** Last data drawn, so an unchanged poll does not redraw and wipe what someone is typing. */
  drawn: "",
};

// Tests open the panel as a normal tab and name the tab to watch in the address.
const WATCH_OVERRIDE = new URLSearchParams(location.search).get("watch");

async function api(path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(`${state.base}/api/ext/${path}`, {
      method,
      headers: { ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(`Cannot reach Potted at ${state.base}. Is the server running?`);
  }
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(json.error || `Potted answered ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return json;
}

function notify(text, good = false) {
  const el = $("notice");
  el.textContent = text;
  el.hidden = !text;
  el.className = good ? "good" : "";
  if (text) setTimeout(() => el.textContent === text && notify(""), 6000);
}

async function watchedTab() {
  if (WATCH_OVERRIDE) return streamFromUrl(WATCH_OVERRIDE, state.base);
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.url ? streamFromUrl(tab.url, state.base) : null;
}

// --- Drawing ---------------------------------------------------------------

const STATUS = { open: "Open for pledges", locked: "Attempt in progress", paid: "Completed", failed: "Refunded" };

function challengeCard(c, minPledgeUsd) {
  // An open pot has no goal; its bar fills ever more slowly, half way at $50.
  const open = c.goalMicro <= 0;
  const pct = open ? Math.round((1 - 1 / (1 + c.totalMicro / 50_000_000)) * 100) : Math.min(100, Math.round((c.totalMicro / c.goalMicro) * 100));
  const room = (c.pledgeCapMicro - c.mineMicro) / 1_000_000;
  const amounts = [1, 5, 10].filter((a) => a >= minPledgeUsd && a <= room);
  let controls = "";
  if (c.status === "open") {
    controls = `
      <div class="row">
        ${amounts.map((a) => `<button class="primary" data-action="pledge" data-amount="${a}">Add $${a}</button>`).join("")}
        ${room >= minPledgeUsd ? `<input class="amount" data-other inputmode="decimal" placeholder="$" aria-label="Other amount" /><button data-action="pledge-other">Add</button>` : ""}
      </div>
      ${room < minPledgeUsd ? `<span class="muted small">You have reached this pot's limit for one planter.</span>` : `<span class="muted small">${open ? "Open pot: no per-planter limit." : `Up to ${usd(c.pledgeCapMicro)} per planter.`}</span>`}`;
  } else if (c.status === "locked") {
    if (c.clipPosted) {
      controls = `
        <div class="clip">
          <a href="${esc(c.clipUrl)}" target="_blank" rel="noreferrer">Watch the clip</a>
          ${c.disputedByMe ? `<span class="muted small">You disputed it. A keeper will review it.</span>` : c.disputeEndsAt && c.disputeEndsAt > Date.now() ? `<span class="muted small">Settles in ${timeLeft(c.disputeEndsAt)} unless a funder disputes.</span>` : `<span class="muted small">Waiting to settle.</span>`}
          ${c.canDispute ? `<button class="danger" data-action="dispute">Dispute this clip</button>` : ""}
        </div>`;
    } else {
      controls = `<span class="muted small">The attempt is on. Pledging is closed.</span>`;
    }
  }
  return `
    <article class="card" data-challenge="${esc(c.id)}">
      <div class="row between">
        <span class="pill ${esc(c.status)}">${STATUS[c.status]}</span>
        ${c.status === "open" ? `<span class="muted small">${timeLeft(c.deadline)} left</span>` : ""}
      </div>
      <p class="title">${esc(c.title)}</p>
      <span class="muted small">${esc(c.game)}</span>
      ${c.splits.map((s) => `<span class="muted small">${esc(s)}</span>`).join("")}
      <div class="pot"><span class="mono">${usd(c.totalMicro)}</span><span class="muted small">${open ? "open pot" : `of ${usd(c.goalMicro)}`} · ${c.planters} ${c.planters === 1 ? "planter" : "planters"}</span></div>
      <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
      ${c.mineMicro > 0 ? `<span class="mine">You have ${usd(c.mineMicro)} in this pot.</span>` : ""}
      ${controls}
    </article>`;
}

function giveCard(stream) {
  const amounts = [1, 5, 10].filter((a) => a >= stream.minPledgeUsd);
  return `
    <section class="card give">
      <p class="eyebrow">Just give</p>
      <span class="muted small">Straight to ${esc(stream.streamer.name)}, no challenge attached. Gifts can't be refunded.</span>
      <input data-gift-note placeholder="Message (optional)" maxlength="140" aria-label="Message with your gift" />
      <div class="row">${amounts.map((a) => `<button class="primary" data-action="give" data-amount="${a}">Give $${a}</button>`).join("")}</div>
    </section>`;
}

function pointsCard(stream) {
  const p = stream.points;
  if (!p) return "";
  return `
    <section class="card points">
      <div class="row between">
        <p class="eyebrow">Channel points</p>
        <span class="pts">${(p.balance ?? 0).toLocaleString()}</span>
      </div>
      <span class="muted small">${p.perUsd.toLocaleString()} points for every $1 you put into ${esc(stream.streamer.name)}'s pots.</span>
      ${p.rewards
        .map((r) => {
          const short = r.cost - (p.balance ?? 0);
          return `<div class="reward" data-reward="${esc(r.id)}">
            <div class="row between"><b>${esc(r.title)}</b><span class="pts small">${r.cost.toLocaleString()}</span></div>
            ${r.note ? `<span class="muted small">${esc(r.note)}</span>` : ""}
            ${
              short > 0
                ? `<span class="muted small">${short.toLocaleString()} more points</span>`
                : `<div class="row">${r.needsInput ? `<input data-reward-input placeholder="Your pick or message" maxlength="140" aria-label="Note for ${esc(r.title)}" style="flex:1" />` : ""}<button class="primary" data-action="redeem">Redeem</button></div>`
            }
          </div>`;
        })
        .join("")}
    </section>`;
}

function ideaForm(stream) {
  if (!stream.acceptingIdeas) return "";
  if (!state.ideaOpen) return `<button class="link" data-action="idea-open">Suggest a challenge to ${esc(stream.streamer.name)}</button>`;
  const games = state.config.games;
  const first = stream.games[0] ?? "other";
  return `
    <form class="card" id="idea">
      <p class="title">Suggest a challenge</p>
      <label>Game
        <select name="gameId">${games.map((g) => `<option value="${esc(g.id)}"${g.id === first ? " selected" : ""}>${esc(g.name)}</option>`).join("")}</select>
      </label>
      <label>Your idea<input name="text" maxlength="140" placeholder="Beat the boss without healing" required /></label>
      <div class="row"><button class="primary">Send idea</button><button type="button" class="link" data-action="idea-close">Cancel</button></div>
    </form>`;
}

function disconnectedView() {
  const samples = state.config?.samples ?? [];
  return `
    <section class="card">
      <p class="eyebrow">Potted beside the stream</p>
      <h2>Back challenges without leaving the stream</h2>
      <span class="muted">Planters pledge and grow their garden. Climbers run their challenges mid-stream. Keepers rule on clips.</span>
      <button class="primary" data-action="connect">Log in or sign up</button>
      <span class="muted small">Signed in on the Potted website in this browser? The panel connects on its own.</span>
      <details>
        <summary>Paste a connection code instead</summary>
        <div class="row" style="margin-top:8px"><input id="code" placeholder="ext.…" aria-label="Connection code" style="flex:1" /><button data-action="use-code">Use</button></div>
      </details>
    </section>
    <div class="divider">or try the demo with test money</div>
    <section class="card">
      <div class="row"><input id="demo-name" placeholder="Your name" aria-label="Your name" maxlength="24" style="flex:1" /><button class="primary" data-action="demo-planter">Join as a planter</button></div>
      <span class="muted small">You start with $25 of test USDC.</span>
      ${
        samples.length
          ? [["fan", "Planters"], ["streamer", "Climbers"], ["mod", "Keepers"]]
              .map(([role, label]) => {
                const group = samples.filter((s) => (s.role ?? "fan") === role);
                return group.length ? `<span class="muted small">${label}:</span><div class="row">${group.map((s) => `<button data-action="demo-sample" data-id="${esc(s.id)}" title="${esc(s.note)}">${esc(s.label)}</button>`).join("")}</div>` : "";
              })
              .join("")
          : ""
      }
    </section>
    <details class="muted small">
      <summary>Server</summary>
      <div class="row" style="margin-top:8px"><input id="base" value="${esc(state.base)}" aria-label="Potted server address" style="flex:1" /><button data-action="save-base">Save</button></div>
    </details>`;
}

// --- Climbers --------------------------------------------------------------

function goLiveCard(watch) {
  if (watch) {
    return `<section class="card live-now">
      <div class="row between"><span class="live-tag">● Live on ${esc(watch.platformName)}</span><span class="muted small">${ago(watch.startedAt).replace(" ago", "")}</span></div>
      <p class="title">${esc(watch.title ?? "Your stream")}</p>
      ${watch.game ? `<span class="muted small">Playing ${esc(watch.game)}. New challenges start on it.</span>` : ""}
      <div class="row"><a class="btn-link" href="${esc(watch.url)}" target="_blank" rel="noreferrer">Open stream</a><button data-action="end-stream">End stream</button></div>
    </section>`;
  }
  return `<section class="card">
    <p class="eyebrow">Going live?</p>
    <span class="muted small">Paste your Twitch, YouTube or Kick link. Potted fills in the title and game.</span>
    <div class="row"><input id="golive" placeholder="twitch.tv/yourname" aria-label="Stream link" /><button class="primary" data-action="go-live">Go live</button></div>
  </section>`;
}

function climberCard(c) {
  let controls = "";
  if (c.status === "open") {
    controls = `<div class="row"><button class="green" data-action="lock">Start the attempt</button><button class="danger" data-action="cancel">Cancel</button></div>`;
  } else if (c.needsClip) {
    controls = `<div class="row"><input data-clip placeholder="Link to the clip" aria-label="Clip link" /><button class="primary" data-action="claim">Post clip</button></div>
      <span class="muted small">Planters get a window to dispute it before it settles.</span>`;
  } else if (c.clipPosted) {
    controls = `<span class="muted small">${c.disputeEndsAt && c.disputeEndsAt > Date.now() ? `Clip posted. Settles in ${timeLeft(c.disputeEndsAt)} unless disputed.` : "Clip posted. A keeper is reviewing a dispute, or it settles shortly."}</span>`;
  } else {
    controls = `<div class="row"><button data-action="check">Check the result now</button></div>`;
  }
  const open = c.goalMicro <= 0;
  const pct = open ? Math.round((1 - 1 / (1 + c.totalMicro / 50_000_000)) * 100) : Math.min(100, Math.round((c.totalMicro / c.goalMicro) * 100));
  return `<article class="card" data-challenge="${esc(c.id)}">
    <div class="row between"><span class="pill ${esc(c.status)}">${STATUS[c.status]}</span>${c.status === "open" ? `<span class="muted small">${timeLeft(c.deadline)} left</span>` : ""}</div>
    <p class="title">${esc(c.title)}</p>
    <div class="pot"><span class="mono">${usd(c.totalMicro)}</span><span class="muted small">${open ? "open pot" : `of ${usd(c.goalMicro)}`} · ${c.planters} ${c.planters === 1 ? "planter" : "planters"}</span></div>
    <div class="bar"><span style="width:${pct}%"></span></div>
    ${controls}
  </article>`;
}

async function climberChallengesView() {
  const [{ live }, channel] = await Promise.all([api("mine"), api("channel")]);
  return `
    ${goLiveCard(channel.watch)}
    <section>
      <div class="section-head"><h3>Live challenges</h3><span class="muted small">${live.length} running</span></div>
      <div class="list">${live.length ? live.map(climberCard).join("") : `<p class="muted small">Nothing running. Start one from an idea or the scout on the website.</p>`}</div>
    </section>
    <button class="link" data-open="/dashboard#new">New challenge on the website</button>`;
}

async function climberChannelView() {
  const ch = await api("channel");
  return `
    <section class="card">
      <div class="row between"><p class="eyebrow">Announcer</p><button data-action="announcer" data-on="${ch.announcer ? "0" : "1"}" class="${ch.announcer ? "green" : ""}">${ch.announcer ? "On" : "Off"}</button></div>
      <span class="muted small">Reads pledges and milestones aloud on your overlay.</span>
    </section>
    <section>
      <div class="section-head"><h3>Redemptions</h3><span class="muted small">${ch.redemptions.length} waiting</span></div>
      <div class="list">${
        ch.redemptions.length
          ? ch.redemptions
              .map(
                (r) => `<div class="card queue" data-redemption="${esc(r.id)}">
                  <div class="row between"><b>${esc(r.title)}</b><span class="muted small">${ago(r.at)}</span></div>
                  <span class="muted small">${esc(r.fanName)}${r.input ? `: “${esc(r.input)}”` : ""}</span>
                  <div class="row"><button class="green" data-action="redemption-done">Done</button><button data-action="redemption-refund">Refund points</button></div>
                </div>`,
              )
              .join("")
          : `<p class="muted small">No redemptions waiting.</p>`
      }</div>
    </section>
    <section>
      <div class="section-head"><h3>Ideas from fans</h3><span class="muted small">${ch.ideas.length} new</span></div>
      <div class="list">${
        ch.ideas.length
          ? ch.ideas
              .map(
                (i) => `<div class="card queue" data-idea="${esc(i.id)}">
                  <span class="muted small">${esc(i.fanName)} · ${esc(i.game)}</span>
                  <b>${esc(i.text)}</b>
                  <div class="row"><button class="primary" data-open="/dashboard?use=${esc(i.id)}#new">Use it</button><button data-action="idea-dismiss">Pass</button></div>
                </div>`,
              )
              .join("")
          : `<p class="muted small">No new ideas.</p>`
      }</div>
    </section>
    <section class="card">
      <p class="eyebrow">Links</p>
      <div class="row between"><span class="small">Fan page</span><button class="link" data-copy="${esc(state.base + ch.fanPage)}">Copy</button></div>
      <div class="row between"><span class="small">Overlay for OBS</span><button class="link" data-copy="${esc(state.base + ch.overlay)}">Copy</button></div>
    </section>
    <button class="link" data-open="/dashboard/channel">Channel settings on the website</button>`;
}

// --- Keepers ---------------------------------------------------------------

async function keeperView() {
  const { cases } = await api("reviews");
  return `
    <div><p class="eyebrow">Keeper</p><h2>${cases.length ? `${cases.length} ${cases.length === 1 ? "clip" : "clips"} to review` : "Nothing to review"}</h2>
    <span class="muted small">Watch the clip, then decide. Upholding pays the climber; rejecting refunds every planter.</span></div>
    ${cases
      .map(
        (c) => `<article class="card" data-challenge="${esc(c.id)}">
          <span class="muted small">${esc(c.streamer)} · ${esc(c.game)}</span>
          <p class="title">${esc(c.title)}</p>
          <span class="muted small">${usd(c.totalMicro)} from ${c.planters} ${c.planters === 1 ? "planter" : "planters"} · disputed by ${c.disputes}</span>
          ${c.clipUrl ? `<a class="watch" href="${esc(c.clipUrl)}" target="_blank" rel="noreferrer">▶ Watch the clip</a>` : ""}
          <div class="row"><button class="green" data-action="uphold">Uphold: pay</button><button class="danger" data-action="reject">Reject: refund</button></div>
        </article>`,
      )
      .join("")}
    <button class="link" data-open="/reviews">Full reviews on the website</button>`;
}

async function streamView() {
  const target = state.picked ?? state.tab;
  const query = target ? (target.handle ? `handle=${encodeURIComponent(target.handle)}` : `platform=${target.platform}&channel=${encodeURIComponent(target.channel)}`) : null;
  const stream = query ? await api(`stream?${query}`) : { streamer: null, challenges: [] };
  state.streamHandle = stream.streamer?.handle ?? null;
  if (stream.streamer) {
    return `
      <div class="who">
        ${stream.streamer.avatarUrl ? `<img class="avatar" src="${esc(stream.streamer.avatarUrl)}" alt="" />` : `<span class="avatar initials">${esc(stream.streamer.name.slice(0, 1).toUpperCase())}</span>`}
        <div>
          <p class="eyebrow">${state.picked ? "Picked from live streams" : "On this tab"}${stream.streamer.live ? ` · <span class="live">LIVE</span>` : ""}</p>
          <h2>${esc(stream.streamer.name)}</h2>
        </div>
      </div>
      <div>
        ${stream.watch ? `<a class="watch" href="${esc(stream.watch.url)}" target="_blank" rel="noreferrer">▶ Watch on ${esc(stream.watch.platformName)}${stream.watch.title ? ` · ${esc(stream.watch.title)}` : ""}</a>` : ""}
        ${stream.cause ? `<span class="muted small">Charity stream: ${stream.cause.pct}% of every completed pot goes to ${esc(stream.cause.name)}.</span>` : ""}
        ${state.picked ? `<button class="link" data-action="unpick">Back to ${state.tab ? "this tab's stream" : "live streams"}</button>` : `<button class="link" data-action="view-browse">Watching someone else? Search</button>`}
      </div>
      ${stream.challenges.length === 0 ? `<p class="muted">Nothing open right now. New challenges appear here on their own.</p>` : stream.challenges.map((c) => challengeCard(c, stream.minPledgeUsd)).join("")}
      ${topPlantersCard(stream)}
      ${giveCard(stream)}
      ${pointsCard(stream)}
      ${ideaForm(stream)}
      <button class="link" data-open="/s/${esc(stream.streamer.handle)}">Open ${esc(stream.streamer.name)}'s page</button>`;
  }
  return `
    <section class="card empty">
      <p class="eyebrow">${state.tab ? "Not on Potted yet" : "Nothing open"}</p>
      <h2>Find a stream to back</h2>
      <span class="muted small">${state.tab ? "This channel hasn't linked Potted yet. Search for who you're watching, or pick someone live." : "Open a stream from Browse and it shows up here, ready to back."}</span>
      <button class="primary" data-action="view-browse">Browse now</button>
    </section>`;
}

const SEARCH_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;

function initials(name) {
  return `<span class="avatar initials" aria-hidden="true">${esc(String(name).slice(0, 1).toUpperCase())}</span>`;
}

/** One stream in a list: who, what they're doing, and the pot. */
function streamRow(s) {
  return `<button class="stream" data-action="pick" data-handle="${esc(s.handle)}">
    ${initials(s.name)}
    <span class="body">
      <span class="name">${s.live === false ? "" : `<span class="dot" aria-label="Live"></span>`}${esc(s.name)}</span>
      <span class="sub">${s.title ? esc(s.title) : s.twitch ? `twitch.tv/${esc(s.twitch)}` : "Not live right now"}${s.game ? ` · ${esc(s.game)}` : ""}</span>
      ${s.reason || s.platform ? `<span class="why">${s.platform ? `<span class="plat">On ${esc({ twitch: "Twitch", youtube: "YouTube", kick: "Kick" }[s.platform])}</span>` : ""}${esc(s.reason ?? "")}</span>` : ""}
    </span>
    ${s.live === false ? "" : `<span class="pot-mini">${usd(s.potMicro)}<small>${s.planters ?? ""}${s.planters != null ? (s.planters === 1 ? " planter" : " planters") : "in pots"}</small></span>`}
  </button>`;
}

function searchResults() {
  if (state.q.trim().length < 2 || !state.found) return "";
  if (state.found.length === 0) return `<p class="muted small">No climber called "${esc(state.q)}" on Potted yet.</p>`;
  return `<div class="list">${state.found.map(streamRow).join("")}</div>`;
}

function section(title, note, items) {
  if (!items.length) return "";
  return `<section>
    <div class="section-head"><h3>${title}</h3>${note ? `<span class="muted small">${note}</span>` : ""}</div>
    <div class="list">${items.map(streamRow).join("")}</div>
  </section>`;
}

/** Search, then the same lists as the website's browse page. */
async function browseView(lead = "") {
  const { forYou = [], trending = [], streams = [] } = await api("live");
  state.liveHandles = streams.map((s) => s.handle);
  return `
    <div>
      <p class="eyebrow">${state.tab && lead ? "No Potted challenges on this channel" : "Live with Potted"}</p>
      <h2>${streams.length === 0 ? "No one is live right now" : "Find a stream to back"}</h2>
      ${lead ? `<span class="muted small">${lead}</span>` : ""}
    </div>
    <div class="search">${SEARCH_ICON}<input id="ext-search" type="search" placeholder="Search a climber or Twitch channel" aria-label="Search climbers" value="${esc(state.q)}" autocomplete="off" /></div>
    <div id="search-results">${searchResults()}</div>
    ${streams.length > 1 ? `<button class="surprise" data-action="surprise">🎲 Surprise me</button>` : ""}
    ${section("For you", "", forYou)}
    ${section("Trending", "Most going on right now", trending)}
    ${section("Most popular", `${streams.length} live`, streams)}`;
}

function topPlantersCard(stream) {
  const top = stream.topPlanters ?? [];
  if (!top.length) return "";
  return `<section class="card">
    <div class="section-head"><p class="eyebrow">Top planters</p><span class="muted small">for ${esc(stream.streamer.name)}</span></div>
    <ol class="podium">
      ${top
        .map(
          (t, i) => `<li class="${t.you ? "you" : ""}">
            <span class="rank">${i + 1}</span>
            <span class="who-name">${esc(t.name)}${t.you ? ` <span class="muted small">(you)</span>` : ""}<br /><span class="muted small">${t.challenges} ${t.challenges === 1 ? "challenge" : "challenges"}</span></span>
            <span class="mono">${usd(t.amountMicro)}</span>
          </li>`,
        )
        .join("")}
    </ol>
  </section>`;
}

async function gardenView() {
  const g = await api("garden");
  const next = g.level.next;
  const pct = next ? Math.min(100, Math.round(((g.xp - g.level.floor) / (next.at - g.level.floor)) * 100)) : 100;
  const earned = g.badges.filter((b) => b.earned);
  const ICON = { pledged: "+", paid: "✓", refunded: "↩" };
  return `
    <section class="card level">
      <p class="eyebrow">Level ${g.level.index + 1}</p>
      <h2>${esc(g.level.name)}</h2>
      <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
      <span class="muted small">${next ? `${g.xp} XP · ${next.at - g.xp} to ${esc(next.name)}` : `${g.xp} XP · top level`}</span>
    </section>
    <div class="stats">
      <div><b>${g.streakDays}</b><span>day streak</span></div>
      <div><b>${g.backed}</b><span>backed</span></div>
      <div><b>${g.grown}</b><span>completed</span></div>
      <div><b>${g.streamersBacked}</b><span>climbers</span></div>
    </div>
    <section>
      <p class="eyebrow">Badges · ${earned.length} of ${g.badges.length}</p>
      <div class="badges">
        ${[...g.badges].sort((a, b) => Number(b.earned) - Number(a.earned)).map((b) => `<button class="badge${b.earned ? " on" : ""}" data-action="badge" data-how="${esc(b.how)}" data-name="${esc(b.name)}">${esc(b.name)}</button>`).join("")}
      </div>
    </section>
    <section>
      <p class="eyebrow">Recent</p>
      ${
        g.activity.length === 0
          ? `<p class="muted small">Back a challenge and it shows up here.</p>`
          : `<ul class="activity">${g.activity
              .map((a) => `<li><span class="icon ${a.kind}">${ICON[a.kind]}</span><span><button class="link" data-open="/c/${esc(a.id)}">${esc(a.title)}</button><span class="muted small">${esc(a.text)} · ${ago(a.at)}</span></span></li>`)
              .join("")}</ul>`
      }
    </section>
    <div class="row between muted small"><span>Pledged ${usd(g.pledgedMicro)}</span><span>Came back ${usd(g.returnedMicro)}</span></div>
    <button class="link" data-open="/garden">Open your full garden</button>`;
}

const TABS = {
  fan: [
    ["stream", "Stream"],
    ["browse", "Browse"],
    ["garden", "Garden"],
  ],
  streamer: [
    ["challenges", "Challenges"],
    ["channel", "Channel"],
  ],
  mod: [],
};

function tabs() {
  const list = TABS[state.me.role] ?? [];
  if (!list.length) return "";
  return `<div class="tabs" role="tablist" style="grid-template-columns:repeat(${list.length},minmax(0,1fr))">
    ${list.map(([key, label]) => `<button role="tab" aria-selected="${state.view === key}" data-action="view-${key}">${label}</button>`).join("")}
  </div>`;
}

/** The view to draw, kept within what this account's role has. */
function viewFor(role) {
  const keys = (TABS[role] ?? []).map(([k]) => k);
  if (role === "mod") return "reviews";
  return keys.includes(state.view) ? state.view : keys[0];
}

async function draw(force = false) {
  const main = $("main");
  if (!state.token || !state.me) {
    const html = disconnectedView();
    if (force || state.drawn !== "out") main.innerHTML = html;
    state.drawn = "out";
    $("account").textContent = "";
    $("footer").innerHTML = "";
    return;
  }
  $("account").innerHTML = `${esc(state.me.name)}${state.me.role === "fan" ? `<br /><b>${usd(state.balanceMicro)}</b>` : ""}`;
  $("footer").innerHTML = `<button class="link" data-open="/">Open the full site</button><button class="link" data-action="disconnect">Disconnect</button>`;
  state.view = viewFor(state.me.role);
  const VIEWS = { stream: streamView, browse: browseView, garden: gardenView, challenges: climberChallengesView, channel: climberChannelView, reviews: keeperView };
  const html = tabs() + (await VIEWS[state.view]());
  redraw(main, `${state.view}:${html}`, html, force);
}

/** Replaces the content only when it changed and nobody is typing in it. */
function redraw(main, key, html, force) {
  const active = document.activeElement;
  const typing = main.contains(active) && (active.tagName === "INPUT" || active.tagName === "SELECT") && (active.value !== "" || active.tagName === "SELECT");
  if (!force && (state.drawn === key || typing)) return;
  main.innerHTML = html;
  state.drawn = key;
}

// --- Loading and actions ---------------------------------------------------

async function refresh(force = false) {
  try {
    if (!state.config) state.config = await api("config");
    if (state.token) {
      try {
        const me = await api("me");
        state.me = me.user;
        state.balanceMicro = me.balanceMicro;
      } catch (error) {
        if (error.status !== 401) throw error;
        // The token expired or the server's data was reset.
        state.token = null;
        state.me = null;
        await chrome.storage.local.remove("token");
      }
    } else {
      state.me = null;
      if (await trySiteSession()) return;
    }
    const tab = await watchedTab();
    // Moving to another stream's tab drops a stream picked from the list.
    if (JSON.stringify(tab) !== JSON.stringify(state.tab)) {
      if (tab) state.picked = null;
      state.ideaOpen = false;
    }
    state.tab = tab;
    await draw(force);
  } catch (error) {
    notify(error.message);
    if (!state.me) await draw(force);
  }
}

/**
 * Signs in with the website's session when the user is already signed in
 * there. Checked at most every 10 seconds while disconnected, and skipped
 * after the user disconnects on purpose until they click Log in again.
 */
let lastSiteCheck = 0;
async function trySiteSession({ force = false } = {}) {
  if (!force && Date.now() - lastSiteCheck < 10_000) return false;
  lastSiteCheck = Date.now();
  const { autoLogin } = await chrome.storage.local.get("autoLogin");
  if (!force && autoLogin === false) return false;
  const token = await tokenFromSiteSession(state.base);
  if (!token) return false;
  await signInWith(token);
  return true;
}

async function signInWith(token) {
  state.token = token;
  await chrome.storage.local.set({ token });
  await refresh(true);
}

async function pledge(id, amount) {
  if (!(amount > 0)) throw new Error("Enter an amount");
  await api(`challenges/${id}/pledge`, { method: "POST", body: { amountUsd: amount } });
  notify(`You added $${amount}. It's in escrow until the result.`, true);
}

async function act(action, target) {
  const card = target.closest("[data-challenge]");
  const id = card?.dataset.challenge;
  const post = (path, body) => api(path, { method: "POST", body: body ?? {} });
  switch (action) {
    case "connect":
      // Already signed in on the site: no need to open it.
      await chrome.storage.local.set({ autoLogin: true });
      if (await trySiteSession({ force: true })) return notify(`Signed in as ${state.me?.name ?? "you"} from the website`, true);
      return chrome.tabs.create({ url: `${state.base}/ext/connect` });
    case "use-code":
      return signInWith($("code").value.trim());
    case "demo-planter":
      return signInWith((await post("demo", { as: "planter", name: $("demo-name").value })).token);
    case "demo-sample":
      return signInWith((await post("demo", { as: target.dataset.id })).token);
    case "save-base": {
      const base = $("base").value.trim().replace(/\/+$/, "") || DEFAULT_BASE;
      // Permission for a server other than the built-in ones, so the panel
      // can call it and follow its sign-in. Asked while the click still counts.
      try {
        await chrome.permissions.request({ origins: [`${new URL(base).origin}/*`] });
      } catch {
        // A bad address; the request below reports it.
      }
      await chrome.storage.local.set({ base });
      state.base = base;
      state.config = null;
      notify(`Using ${base}`, true);
      return refresh(true);
    }
    case "disconnect":
      // Stay disconnected even though the site is still signed in.
      await chrome.storage.local.set({ autoLogin: false });
      state.token = null;
      state.me = null;
      state.picked = null;
      await chrome.storage.local.remove("token");
      return refresh(true);
    case "view-stream":
    case "view-browse":
    case "view-garden":
    case "view-challenges":
    case "view-channel":
      state.view = action.slice(5);
      return draw(true);
    case "go-live": {
      const r = await post("golive", { link: $("golive").value });
      notify(`You're live on ${r.watch.platformName}.`, true);
      break;
    }
    case "end-stream":
      await post("endstream");
      notify("Stream ended. You're off Browse.", true);
      break;
    case "lock":
      if (!confirm("Close pledging and start the attempt?")) return;
      await post(`challenges/${id}/lock`);
      notify("Started. Pledging is closed.", true);
      break;
    case "cancel":
      if (!confirm("Cancel this challenge and refund every planter?")) return;
      await post(`challenges/${id}/cancel`);
      notify("Cancelled. Planters are refunded.", true);
      break;
    case "claim":
      await post(`challenges/${id}/claim`, { clipUrl: card.querySelector("[data-clip]").value.trim() });
      notify("Clip posted. The dispute window is open.", true);
      break;
    case "check":
      await post(`challenges/${id}/check`);
      notify("Checked the game data.", true);
      break;
    case "announcer":
      await post("announcer", { on: target.dataset.on === "1" });
      break;
    case "redemption-done":
    case "redemption-refund":
      await post(`redemptions/${target.closest("[data-redemption]").dataset.redemption}`, { outcome: action === "redemption-done" ? "fulfilled" : "refunded" });
      break;
    case "idea-dismiss":
      await post(`ideas/${target.closest("[data-idea]").dataset.idea}/dismiss`);
      break;
    case "uphold":
    case "reject":
      if (!confirm(action === "uphold" ? "Uphold the clip and pay the climber?" : "Reject the clip and refund every planter?")) return;
      await post(`challenges/${id}/rule`, { upheld: action === "uphold" });
      notify(action === "uphold" ? "Upheld. The climber is paid." : "Rejected. Planters are refunded.", true);
      break;
    case "pick":
      state.picked = { handle: target.dataset.handle };
      state.ideaOpen = false;
      state.view = "stream";
      return draw(true);
    case "surprise": {
      const others = (state.liveHandles ?? []).filter((h) => h !== state.streamHandle);
      if (!others.length) return;
      state.picked = { handle: others[Math.floor(Math.random() * others.length)] };
      state.view = "stream";
      return draw(true);
    }
    case "badge":
      return notify(`${target.dataset.name}: ${target.dataset.how}`, true);
    case "unpick":
      state.picked = null;
      return draw(true);
    case "idea-open":
    case "idea-close":
      state.ideaOpen = action === "idea-open";
      return draw(true);
    case "pledge":
      await pledge(id, Number(target.dataset.amount));
      break;
    case "pledge-other":
      await pledge(id, Number(card.querySelector("[data-other]").value.replace("$", "")));
      break;
    case "give": {
      const amount = Number(target.dataset.amount);
      const note = $("main").querySelector("[data-gift-note]")?.value ?? "";
      await post("give", { handle: state.streamHandle, amountUsd: amount, note });
      notify(`You gave $${amount}. Thank you!`, true);
      break;
    }
    case "redeem": {
      const row = target.closest("[data-reward]");
      const input = row.querySelector("[data-reward-input]")?.value ?? "";
      const r = await post("redeem", { handle: state.streamHandle, rewardId: row.dataset.reward, input });
      notify(`Redeemed ${r.title}. It's in the streamer's queue.`, true);
      break;
    }
    case "dispute":
      if (!confirm("Dispute this clip? A keeper will review it before any money moves.")) return;
      await post(`challenges/${id}/dispute`);
      notify("Disputed. A keeper will review the clip.", true);
      break;
    default:
      return;
  }
  await refresh(true);
}

document.addEventListener("click", async (event) => {
  const copy = event.target.closest("[data-copy]");
  if (copy) {
    await navigator.clipboard.writeText(copy.dataset.copy).catch(() => {});
    copy.textContent = "Copied";
    setTimeout(() => (copy.textContent = "Copy"), 1500);
    return;
  }
  const open = event.target.closest("[data-open]");
  if (open) return chrome.tabs.create({ url: state.base + open.dataset.open });
  const target = event.target.closest("[data-action]");
  if (!target) return;
  target.disabled = true;
  try {
    await act(target.dataset.action, target);
  } catch (error) {
    notify(error.message);
  } finally {
    target.disabled = false;
  }
});

document.addEventListener("submit", async (event) => {
  if (event.target.id !== "idea") return;
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.target).entries());
  const button = event.target.querySelector("button");
  button.disabled = true;
  try {
    await api("ideas", { method: "POST", body: { handle: state.streamHandle, gameId: form.gameId, text: form.text } });
    notify("Idea sent. The climber sees it on their dashboard.", true);
    state.ideaOpen = false;
    await refresh(true);
  } catch (error) {
    notify(error.message);
    button.disabled = false;
  }
});

// Search as you type, a moment after the last key, without redrawing the panel.
let searchTimer;
let searchSeq = 0;
document.addEventListener("input", (event) => {
  if (event.target.id !== "ext-search") return;
  state.q = event.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    const seq = ++searchSeq;
    const q = state.q.trim();
    try {
      state.found = q.length < 2 ? null : (await api(`search?q=${encodeURIComponent(q)}`)).streamers;
    } catch (error) {
      notify(error.message);
      return;
    }
    if (seq !== searchSeq) return;
    const box = $("search-results");
    if (box) box.innerHTML = searchResults();
  }, 200);
});

// The background worker stores the token when the connect page hands it over.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.token && changes.token.newValue !== state.token) {
    state.token = changes.token.newValue ?? null;
    refresh(true);
  }
});
chrome.tabs.onActivated.addListener(() => refresh());
chrome.tabs.onUpdated.addListener((_id, change) => change.url && refresh());

const settings = await getSettings();
state.base = settings.base;
state.token = settings.token;
await refresh(true);
setInterval(() => refresh(), 3000);
