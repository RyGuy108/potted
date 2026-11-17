import { DEFAULT_BASE, getSettings, streamFromUrl } from "./shared.js";

/**
 * The side panel. It holds no rules of its own: every action is a call to
 * the Potted server, which decides what is allowed. The panel only shows
 * the result.
 */

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const usd = (micro) => {
  const dollars = micro / 1_000_000;
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`;
};
const minutesLeft = (deadline) => {
  const mins = Math.max(0, Math.round((deadline - Date.now()) / 60_000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m left` : `${mins}m left`;
};

const state = {
  base: DEFAULT_BASE,
  token: null,
  me: null,
  balanceMicro: 0,
  config: null,
  /** Which stream the watched tab shows, or null. */
  tab: null,
  climberTab: "run",
  gameId: "chess",
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

function challengeCard(c, controls) {
  const pct = Math.min(100, Math.round((c.totalMicro / c.goalMicro) * 100));
  return `
    <article class="card" data-challenge="${esc(c.id)}">
      <div class="row">
        <span class="pill ${esc(c.status)}">${{ open: "Open for pledges", locked: "Attempt in progress", paid: "Completed", failed: "Refunded" }[c.status]}</span>
        ${c.status === "open" || c.status === "locked" ? `<span class="muted small">${minutesLeft(c.deadline)}</span>` : ""}
      </div>
      <p class="title">${esc(c.title)}</p>
      ${c.splits.map((s) => `<span class="muted small">${esc(s)}</span>`).join("")}
      <div class="pot"><span class="mono">${usd(c.totalMicro)}</span><span class="muted small">of ${usd(c.goalMicro)} · ${c.planters} ${c.planters === 1 ? "planter" : "planters"}</span></div>
      <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
      ${c.note && c.status !== "open" && !c.clipPosted ? `<span class="muted small">${esc(c.note)}</span>` : ""}
      ${controls(c)}
    </article>`;
}

function planterControls(minPledgeUsd) {
  return (c) => {
    if (c.status !== "open") return c.mineMicro > 0 ? `<span class="muted small">You have ${usd(c.mineMicro)} in this pot.</span>` : "";
    const room = (c.pledgeCapMicro - c.mineMicro) / 1_000_000;
    const amounts = [1, 5, 10].filter((a) => a >= minPledgeUsd && a <= room);
    return `
      ${c.mineMicro > 0 ? `<span class="muted small">You have ${usd(c.mineMicro)} in this pot.</span>` : ""}
      <div class="row">
        ${amounts.map((a) => `<button class="primary" data-action="pledge" data-amount="${a}">Add $${a}</button>`).join("")}
        ${amounts.length === 0 ? `<span class="muted small">${room <= 0 ? "You have reached this pot's limit for one fan." : `Pledges here are $${minPledgeUsd} to $${room}.`}</span>` : ""}
      </div>`;
  };
}

function climberControls(c) {
  if (c.status === "open") {
    return `<div class="row">
      <button class="primary" data-action="lock">Start attempt</button>
      <button class="danger" data-action="cancel">Cancel and refund</button>
    </div>`;
  }
  if (c.status === "locked") {
    return `
      ${
        c.needsClip
          ? `<div class="row"><input data-clip placeholder="https:// link to your clip" aria-label="Clip link" style="flex:1" /><button class="primary" data-action="claim">Post clip</button></div>`
          : c.clipPosted
            ? `<span class="muted small">Clip posted. It settles when the dispute window ends.</span>`
            : ""
      }
      <div class="row">
        <button data-action="check">Check now</button>
        <button class="danger" data-action="cancel">Give up and refund</button>
        ${state.config?.rehearsal ? `<button data-action="win">Rehearse a win</button><button data-action="miss">Rehearse a miss</button>` : ""}
      </div>`;
  }
  return "";
}

function field(f) {
  const value = esc(f.initial ?? "");
  const control = f.options
    ? `<select name="${esc(f.name)}">${f.options.map(([v, label]) => `<option value="${esc(v)}"${v === (f.initial ?? "") ? " selected" : ""}>${esc(label)}</option>`).join("")}</select>`
    : `<input name="${esc(f.name)}" value="${value}" placeholder="${esc(f.placeholder ?? "")}"${f.numeric ? ' inputmode="numeric"' : ""}${f.required ? " required" : ""} />`;
  return `<label>${esc(f.label)}${control}</label>`;
}

function newChallengeForm() {
  const games = state.config.games;
  const game = games.find((g) => g.id === state.gameId) ?? games[0];
  return `
    <form class="card" id="new-challenge">
      <label>Game or stream type
        <select id="game">${games.map((g) => `<option value="${esc(g.id)}"${g.id === game.id ? " selected" : ""}>${esc(g.name)}</option>`).join("")}</select>
      </label>
      <span class="muted small">${esc(game.how)}</span>
      ${game.fields.map(field).join("")}
      <div class="grid2">${state.config.potFields.map(field).join("")}</div>
      <button class="primary">Open for pledges</button>
    </form>`;
}

function disconnectedView() {
  return `
    <section class="card">
      <p class="eyebrow">Join in</p>
      <h2>Connect your Potted account</h2>
      <span class="muted">Fund challenges and run your own without leaving the stream.</span>
      <button class="primary" data-action="connect">Log in / Sign up</button>
      <details>
        <summary>Paste a connection code instead</summary>
        <div class="row" style="margin-top:8px"><input id="code" placeholder="ext.…" aria-label="Connection code" style="flex:1" /><button data-action="use-code">Use</button></div>
      </details>
    </section>
    <div class="divider">or try the demo with test money</div>
    <section class="card">
      <div class="row"><input id="demo-name" placeholder="Your name" aria-label="Your name" maxlength="24" style="flex:1" /><button class="primary" data-action="demo-planter">Join as a planter</button></div>
      <span class="muted small">Planters back challenges. You start with $25 of test USDC.</span>
      <div class="row"><span class="muted small">Or run challenges as a demo climber:</span><button data-action="demo-ryan">Ryan</button><button data-action="demo-kai">Kai</button></div>
    </section>
    <details class="muted small">
      <summary>Server</summary>
      <div class="row" style="margin-top:8px"><input id="base" value="${esc(state.base)}" aria-label="Potted server address" style="flex:1" /><button data-action="save-base">Save</button></div>
    </details>`;
}

async function planterView() {
  const query = state.tab ? (state.tab.handle ? `handle=${encodeURIComponent(state.tab.handle)}` : `platform=${state.tab.platform}&channel=${encodeURIComponent(state.tab.channel)}`) : null;
  const stream = query ? await api(`stream?${query}`) : { streamer: null, challenges: [] };
  if (stream.streamer) {
    return `
      <div>
        <p class="eyebrow">On this tab</p>
        <h2>${esc(stream.streamer.name)}</h2>
        ${stream.cause ? `<span class="muted small">Charity stream: ${stream.cause.pct}% of every completed pot goes to ${esc(stream.cause.name)}.</span>` : ""}
      </div>
      ${stream.challenges.length === 0 ? `<p class="muted">Nothing open right now. New challenges appear here on their own.</p>` : stream.challenges.map((c) => challengeCard(c, planterControls(stream.minPledgeUsd))).join("")}
      <button class="link" data-open="/s/${esc(stream.streamer.handle)}">Open ${esc(stream.streamer.name)}'s full page</button>`;
  }
  const { streams } = await api("live");
  return `
    <div>
      <p class="eyebrow">${state.tab ? "No Potted challenges on this channel" : "Live with Potted"}</p>
      <h2>${streams.length === 0 ? "No one is live right now" : "Pick a stream"}</h2>
      ${state.tab ? `<span class="muted small">This channel has not linked Potted. Here is who is live.</span>` : ""}
    </div>
    ${streams
      .map(
        (s) => `<button class="card" data-open="/s/${esc(s.handle)}" style="text-align:left;min-height:0">
          <span class="title">${esc(s.title)}</span>
          <span class="muted small">${esc(s.name)} · ${esc(s.game)}</span>
          <span class="mono">${usd(s.potMicro)} <span class="muted small">in the pot · ${s.planters} ${s.planters === 1 ? "planter" : "planters"}</span></span>
        </button>`,
      )
      .join("")}`;
}

async function climberStage() {
  const mine = await api("mine");
  return `
    ${mine.live.length === 0 ? `<p class="muted">Nothing live. Open a challenge from the New tab.</p>` : mine.live.map((c) => challengeCard(c, climberControls)).join("")}
    ${mine.recent.length > 0 ? `<h2>Recent</h2>${mine.recent.map((c) => challengeCard(c, () => "")).join("")}` : ""}`;
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
  $("account").innerHTML = `${esc(state.me.name)}<br /><b>${usd(state.balanceMicro)}</b>`;
  $("footer").innerHTML = `<button class="link" data-open="/">Open the full site</button><button class="link" data-action="disconnect">Disconnect</button>`;

  if (state.me.role === "streamer") {
    const tabs = `<div class="tabs" role="tablist">
      <button role="tab" aria-selected="${state.climberTab === "run"}" data-action="tab-run">Run</button>
      <button role="tab" aria-selected="${state.climberTab === "new"}" data-action="tab-new">New challenge</button>
    </div>`;
    if (state.climberTab === "new") {
      // The form is drawn once per game choice and then left alone, so polling never clears it.
      const key = `new:${state.gameId}`;
      if (force || state.drawn !== key) main.innerHTML = tabs + newChallengeForm();
      state.drawn = key;
      return;
    }
    const html = tabs + (await climberStage());
    redraw(main, `run:${html}`, html, force);
    return;
  }
  const html = await planterView();
  redraw(main, `fan:${html}`, html, force);
}

/** Replaces the content only when it changed and nobody is typing in it. */
function redraw(main, key, html, force) {
  const typing = main.contains(document.activeElement) && document.activeElement.tagName === "INPUT" && document.activeElement.value !== "";
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
    state.tab = await watchedTab();
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
    case "demo-ryan":
    case "demo-kai":
      return signInWith((await post("demo", { as: action.slice(5) })).token);
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
      await chrome.storage.local.remove("token");
      return refresh(true);
    case "tab-run":
    case "tab-new":
      state.climberTab = action.slice(4);
      return draw(true);
    case "pledge":
      await post(`challenges/${id}/pledge`, { amountUsd: Number(target.dataset.amount) });
      notify(`You added $${target.dataset.amount}.`, true);
      break;
    case "lock":
      if (!confirm("Close pledging and start the attempt?")) return;
      await post(`challenges/${id}/lock`);
      break;
    case "cancel":
      if (!confirm("Refund every fan and end this challenge?")) return;
      await post(`challenges/${id}/cancel`);
      notify("Cancelled. Every pledge was refunded.", true);
      break;
    case "claim":
      await post(`challenges/${id}/claim`, { clipUrl: card.querySelector("[data-clip]").value.trim() });
      notify("Clip posted.", true);
      break;
    case "check":
      await post(`challenges/${id}/check`);
      break;
    case "win":
    case "miss":
      await post(`challenges/${id}/simulate`, { success: action === "win" });
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

document.addEventListener("change", (event) => {
  if (event.target.id !== "game") return;
  state.gameId = event.target.value;
  draw(true);
});

document.addEventListener("submit", async (event) => {
  if (event.target.id !== "new-challenge") return;
  event.preventDefault();
  const fields = Object.fromEntries(new FormData(event.target).entries());
  const button = event.target.querySelector("button");
  button.disabled = true;
  try {
    await api("challenges", { method: "POST", body: { gameId: state.gameId, fields } });
    notify("Challenge open for pledges.", true);
    state.climberTab = "run";
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
