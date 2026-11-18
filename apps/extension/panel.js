import { DEFAULT_BASE, getSettings, streamFromUrl } from "./shared.js";

/**
 * The side panel, for planters. It follows the tab you are watching: on a
 * linked Twitch or YouTube channel (or a Potted stream page) it shows that
 * climber's live challenges so you can back them without leaving the
 * stream. Climbers and keepers do their work on the website.
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
  /** "stream" or "garden". */
  view: "stream",
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
  const pct = Math.min(100, Math.round((c.totalMicro / c.goalMicro) * 100));
  const room = (c.pledgeCapMicro - c.mineMicro) / 1_000_000;
  const amounts = [1, 5, 10].filter((a) => a >= minPledgeUsd && a <= room);
  let controls = "";
  if (c.status === "open") {
    controls = `
      <div class="row">
        ${amounts.map((a) => `<button class="primary" data-action="pledge" data-amount="${a}">Add $${a}</button>`).join("")}
        ${room >= minPledgeUsd ? `<input class="amount" data-other inputmode="decimal" placeholder="$" aria-label="Other amount" /><button data-action="pledge-other">Add</button>` : ""}
      </div>
      ${room < minPledgeUsd ? `<span class="muted small">You have reached this pot's limit for one planter.</span>` : `<span class="muted small">Up to ${usd(c.pledgeCapMicro)} per planter.</span>`}`;
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
      <div class="pot"><span class="mono">${usd(c.totalMicro)}</span><span class="muted small">of ${usd(c.goalMicro)} · ${c.planters} ${c.planters === 1 ? "planter" : "planters"}</span></div>
      <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
      ${c.mineMicro > 0 ? `<span class="mine">You have ${usd(c.mineMicro)} in this pot.</span>` : ""}
      ${controls}
    </article>`;
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
      <p class="eyebrow">For planters</p>
      <h2>Back challenges without leaving the stream</h2>
      <span class="muted">Pledge to the climber you're watching, dispute a clip, and grow your garden.</span>
      <button class="primary" data-action="connect">Log in or sign up</button>
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
          ? `<span class="muted small">Or use a ready-made planter:</span><div class="row">${samples.map((s) => `<button data-action="demo-sample" data-id="${esc(s.id)}" title="${esc(s.note)}">${esc(s.label)}</button>`).join("")}</div>`
          : ""
      }
    </section>
    <details class="muted small">
      <summary>Server</summary>
      <div class="row" style="margin-top:8px"><input id="base" value="${esc(state.base)}" aria-label="Potted server address" style="flex:1" /><button data-action="save-base">Save</button></div>
    </details>`;
}

/** Climbers and keepers get a pointer to the website, where their tools are. */
function otherRoleView() {
  const climber = state.me.role === "streamer";
  return `
    <section class="card">
      <p class="eyebrow">${climber ? "Climber account" : "Keeper account"}</p>
      <h2>${climber ? "Run your challenges on the website" : "Review clips on the website"}</h2>
      <span class="muted">The extension is for planters backing challenges while they watch. ${climber ? "Your dashboard has the scout, your challenges and your overlay." : "Disputed clips wait for you on the reviews page."}</span>
      <button class="primary" data-open="${climber ? "/dashboard" : "/reviews"}">Open ${climber ? "the dashboard" : "reviews"}</button>
    </section>`;
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
        ${stream.cause ? `<span class="muted small">Charity stream: ${stream.cause.pct}% of every completed pot goes to ${esc(stream.cause.name)}.</span>` : ""}
        ${state.picked ? `<button class="link" data-action="unpick">Back to ${state.tab ? "this tab's stream" : "live streams"}</button>` : ""}
      </div>
      ${stream.challenges.length === 0 ? `<p class="muted">Nothing open right now. New challenges appear here on their own.</p>` : stream.challenges.map((c) => challengeCard(c, stream.minPledgeUsd)).join("")}
      ${pointsCard(stream)}
      ${ideaForm(stream)}
      <button class="link" data-open="/s/${esc(stream.streamer.handle)}">Open ${esc(stream.streamer.name)}'s page</button>`;
  }
  const { streams } = await api("live");
  return `
    <div>
      <p class="eyebrow">${state.tab ? "No Potted challenges on this channel" : "Live with Potted"}</p>
      <h2>${streams.length === 0 ? "No one is live right now" : "Pick a stream to back"}</h2>
      ${state.tab ? `<span class="muted small">This channel has not linked Potted yet. Here is who is live.</span>` : ""}
    </div>
    ${streams
      .map(
        (s) => `<button class="card stream" data-action="pick" data-handle="${esc(s.handle)}">
          <span class="title">${esc(s.title)}</span>
          <span class="muted small">${esc(s.name)} · ${esc(s.game)}</span>
          <span class="mono">${usd(s.potMicro)} <span class="muted small">in the pot · ${s.planters} ${s.planters === 1 ? "planter" : "planters"}</span></span>
        </button>`,
      )
      .join("")}`;
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
        ${g.badges.map((b) => `<span class="badge${b.earned ? " on" : ""}" title="${esc(b.how)}">${esc(b.name)}</span>`).join("")}
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

function tabs() {
  return `<div class="tabs" role="tablist">
    <button role="tab" aria-selected="${state.view === "stream"}" data-action="view-stream">Stream</button>
    <button role="tab" aria-selected="${state.view === "garden"}" data-action="view-garden">My garden</button>
  </div>`;
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
  if (state.me.role !== "fan") {
    redraw(main, "other", otherRoleView(), force);
    return;
  }
  const html = tabs() + (state.view === "garden" ? await gardenView() : await streamView());
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
      return chrome.tabs.create({ url: `${state.base}/ext/connect` });
    case "use-code":
      return signInWith($("code").value.trim());
    case "demo-planter":
      return signInWith((await post("demo", { as: "planter", name: $("demo-name").value })).token);
    case "demo-sample":
      return signInWith((await post("demo", { as: target.dataset.id })).token);
    case "save-base": {
      const base = $("base").value.trim().replace(/\/+$/, "") || DEFAULT_BASE;
      await chrome.storage.local.set({ base });
      state.base = base;
      state.config = null;
      notify(`Using ${base}`, true);
      return refresh(true);
    }
    case "disconnect":
      state.token = null;
      state.me = null;
      state.picked = null;
      await chrome.storage.local.remove("token");
      return refresh(true);
    case "view-stream":
    case "view-garden":
      state.view = action.slice(5);
      return draw(true);
    case "pick":
      state.picked = { handle: target.dataset.handle };
      state.ideaOpen = false;
      return draw(true);
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
