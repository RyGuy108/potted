/** Where the Potted server lives unless the user points the extension elsewhere. */
export const DEFAULT_BASE = "http://localhost:3000";

export async function getSettings() {
  const { base, token } = await chrome.storage.local.get(["base", "token"]);
  return { base: (base || DEFAULT_BASE).replace(/\/+$/, ""), token: token || null };
}

/**
 * The connect page puts the account's token after the # in its address.
 * Returns it only when the address really is this server's connect page.
 */
export function tokenFromConnectUrl(url, base) {
  if (!url || !url.startsWith(`${base}/ext/connect`)) return null;
  const match = url.match(/#potted-token=([A-Za-z0-9._-]+)$/);
  return match ? match[1] : null;
}

/** Works out which stream a tab is showing, from its address alone. */
export function streamFromUrl(url, base) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (url.startsWith(`${base}/s/`) && parts[1]) return { handle: parts[1].toLowerCase() };
  const host = parsed.hostname.replace(/^(www|m)\./, "");
  if (host === "twitch.tv" && parts.length >= 1) {
    // twitch.tv/<channel>, not the site's own sections.
    const reserved = new Set(["directory", "videos", "settings", "subscriptions", "inventory", "wallet", "drops", "search", "downloads", "p", "jobs", "turbo", "store"]);
    if (!reserved.has(parts[0].toLowerCase())) return { platform: "twitch", channel: parts[0].toLowerCase() };
  }
  if (host === "youtube.com" && parts[0]?.startsWith("@")) return { platform: "youtube", channel: parts[0].slice(1).toLowerCase() };
  if (host === "kick.com" && parts[0]) return { platform: "kick", channel: parts[0].toLowerCase() };
  return null;
}
