import { getSettings, tokenFromConnectUrl } from "./shared.js";

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
