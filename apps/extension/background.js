import { OLD_DEFAULT_BASE, getSettings, tokenFromConnectUrl, tokenFromSiteSession } from "./shared.js";

// Clicking the toolbar icon opens the side panel beside the current tab.
chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// When the user signs in on the site's connect page, pick up the token
// from that tab's address, keep it, and close the tab.
chrome.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  const url = change.url ?? tab.url;
  if (!url || !url.includes("#potted-token=")) return;
  const { base } = await getSettings();
  const token = tokenFromConnectUrl(url, base);
  if (!token) return;
  await chrome.storage.local.set({ token });
  chrome.tabs.remove(tabId).catch(() => {});
});

// Earlier versions defaulted to a local server. Drop that saved address on
// update so the extension talks to the hosted site; a developer can set it
// back under Server.
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== "update") return;
  const { base } = await chrome.storage.local.get("base");
  if (base && base.replace(/\/+$/, "") === OLD_DEFAULT_BASE) await chrome.storage.local.remove(["base", "token"]);
});

// Signing in or out on the website changes its session cookie. Follow it:
// sign the extension in when the user signs in on the site, unless they
// disconnected the extension on purpose.
chrome.cookies?.onChanged.addListener(async ({ cookie, removed }) => {
  if (cookie.name !== "potted_uid" || removed) return;
  const { base, token } = await getSettings();
  const host = new URL(base).hostname;
  const domain = cookie.domain.replace(/^\./, "");
  if (token || !(host === domain || host.endsWith(`.${domain}`))) return;
  const { autoLogin } = await chrome.storage.local.get("autoLogin");
  if (autoLogin === false) return;
  const fresh = await tokenFromSiteSession(base);
  if (fresh) await chrome.storage.local.set({ token: fresh });
});
