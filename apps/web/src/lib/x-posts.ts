import { createHmac, randomBytes } from "node:crypto";
import { type ChainMoment, draftPost } from "@potted/coordinator";
import { db, save } from "./store";

/**
 * Grok posting on X from on-chain events. The QuickNode Stream reports a
 * pot crossing half its goal, reaching it, or a challenge settling; Grok
 * writes the post (checked for the right link, real figures and no
 * mentions) and it goes out from Potted's own X account.
 *
 * Posts are drafts unless POTTED_X_POSTS=auto and the account's keys are
 * set, since each post with a link costs money on X's pay-per-use API.
 */

export interface XPost {
  /** "<challenge id>:<moment>": one post per moment per challenge. */
  key: string;
  challengeId: string;
  kind: ChainMoment["kind"];
  text: string;
  by: "grok" | "rules";
  status: "draft" | "posted" | "failed";
  /** The transaction the Stream reported. */
  signature: string;
  postId?: string;
  error?: string;
  at: number;
}

/** The four values X's developer console gives for the app's own account (OAuth 1.0a user context). */
function xKeys() {
  const { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET } = process.env;
  return X_API_KEY && X_API_SECRET && X_ACCESS_TOKEN && X_ACCESS_SECRET
    ? { consumerKey: X_API_KEY, consumerSecret: X_API_SECRET, token: X_ACCESS_TOKEN, tokenSecret: X_ACCESS_SECRET }
    : undefined;
}

export function autoPosting(): boolean {
  return process.env.POTTED_X_POSTS === "auto" && Boolean(xKeys());
}

const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * An OAuth 1.0a Authorization header (HMAC-SHA1). `params` are the query or
 * form parameters that are signed; a JSON body is not part of the signature.
 */
export function oauthHeader(
  method: string,
  url: string,
  keys: { consumerKey: string; consumerSecret: string; token: string; tokenSecret: string },
  params: Record<string, string> = {},
  nonce = randomBytes(16).toString("hex"),
  timestamp = Math.floor(Date.now() / 1000).toString(),
): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: keys.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: keys.token,
    oauth_version: "1.0",
  };
  const all = { ...params, ...oauth };
  const paramString = Object.keys(all)
    .map((k) => [enc(k), enc(all[k]!)] as const)
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : 1) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const base = `${method.toUpperCase()}&${enc(url)}&${enc(paramString)}`;
  const signature = createHmac("sha1", `${enc(keys.consumerSecret)}&${enc(keys.tokenSecret)}`).update(base).digest("base64");
  return (
    "OAuth " +
    Object.entries({ ...oauth, oauth_signature: signature })
      .map(([k, v]) => `${enc(k)}="${enc(v)}"`)
      .join(", ")
  );
}

/** Posts on X from Potted's account. Returns the post's id. */
export async function postToX(text: string, doFetch: typeof fetch = fetch): Promise<string> {
  const keys = xKeys();
  if (!keys) throw new Error("Set X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN and X_ACCESS_SECRET to post on X");
  const url = "https://api.x.com/2/tweets";
  const res = await doFetch(url, { method: "POST", headers: { Authorization: oauthHeader("POST", url, keys), "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
  const body = (await res.json().catch(() => ({}))) as { data?: { id?: string }; detail?: string; title?: string };
  if (!res.ok || !body.data?.id) throw new Error(`X refused the post (${res.status})${body.detail ? `: ${body.detail}` : ""}`);
  return body.data.id;
}

/**
 * Drafts the post for an on-chain moment, once per challenge and moment,
 * and posts it when auto-posting is on. Never throws: a failed post is kept
 * with its error for the activity page.
 */
export async function postMoment(challengeId: string, moment: ChainMoment, doFetch: typeof fetch = fetch): Promise<XPost | undefined> {
  const state = db();
  state.xPosts ??= [];
  const key = `${challengeId}:${moment.kind}`;
  if (state.xPosts.some((p) => p.key === key)) return undefined;
  // Claim the key before awaiting Grok, so a redelivery cannot draft it twice.
  const post: XPost = { key, challengeId, kind: moment.kind, text: "", by: "rules", status: "draft", signature: moment.signature, at: Date.now() };
  state.xPosts.push(post);
  try {
    const draft = await draftPost(moment);
    post.text = draft.text;
    post.by = draft.source;
    if (autoPosting()) {
      post.postId = await postToX(post.text, doFetch);
      post.status = "posted";
    }
  } catch (error) {
    post.status = post.text ? "failed" : "draft";
    post.error = error instanceof Error ? error.message : String(error);
  }
  if (state.xPosts.length > 200) state.xPosts.splice(0, state.xPosts.length - 200);
  save();
  return post;
}

export function xPosts(limit = 20): XPost[] {
  return (db().xPosts ?? []).slice(-limit).reverse();
}
