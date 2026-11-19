/** Where the Potted server lives unless the user points the extension elsewhere. */
export const DEFAULT_BASE = "https://potted-production-25981257.up.railway.app";

/** The default before the site moved to Railway. A saved copy of it is dropped on update. */
export const OLD_DEFAULT_BASE = "http://localhost:3000";

/** The website's session cookie (see apps/web/src/lib/session.ts). */
const SESSION_COOKIE = "potted_uid";

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

/**
 * If the user is signed in on the website, returns an extension token for
 * that account, otherwise null. The browser sends the site's cookie because
 * the extension has permission for the site; if it doesn't (a stricter
 * cookie setting), the extension reads the cookie itself and sends it.
 */
export async function tokenFromSiteSession(base) {
  const ask = async (headers) => {
    try {
      const response = await fetch(`${base}/api/ext-session`, { credentials: "include", cache: "no-store", headers });
      if (!response.ok) return null;
      const { token } = await response.json();
      return typeof token === "string" ? token : null;
    } catch {
      return null;
    }
  };
  const viaBrowser = await ask({});
  if (viaBrowser) return viaBrowser;
  try {
    const cookie = await chrome.cookies?.get({ url: base, name: SESSION_COOKIE });
    if (cookie?.value) return await ask({ "X-Potted-Session": cookie.value });
  } catch {
    // No permission for this server address: the user can still log in by hand.
  }
  return null;
}
