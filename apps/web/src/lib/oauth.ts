/**
 * Sign-in with an existing account, using the standard OAuth code flow.
 * A provider is switched on by setting its client id and secret; see
 * docs/auth.md. Nothing here stores a password or a provider token: the
 * token is used once to read the profile and then dropped.
 */

export interface Deps {
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
}

export interface Profile {
  /** The provider's stable id for this person. */
  subject: string;
  name: string;
  email?: string;
  /** The provider can vouch for mailbox ownership for account matching. */
  emailVerified?: boolean;
  avatarUrl?: string;
  bio?: string;
  login?: string;
}

interface Provider {
  label: string;
  envPrefix: string;
  authorize: string;
  token: string;
  userinfo: string;
  scope: string;
  /** Twitch wants the client id on API calls as well as the token. */
  clientIdHeader?: string;
  profile(body: any): Profile | undefined;
}

const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export const PROVIDERS = {
  google: {
    label: "Google",
    envPrefix: "GOOGLE",
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    userinfo: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
    profile: (b) => (text(b?.sub) ? { subject: b.sub, name: text(b.given_name) ?? text(b.name) ?? "Planter", email: text(b.email), ...(b.email_verified === true && (/@gmail\.com$/i.test(b.email ?? "") || text(b.hd)) ? { emailVerified: true } : {}), ...(text(b.picture) ? { avatarUrl: b.picture } : {}) } : undefined),
  },
  twitch: {
    label: "Twitch",
    envPrefix: "TWITCH",
    authorize: "https://id.twitch.tv/oauth2/authorize",
    token: "https://id.twitch.tv/oauth2/token",
    userinfo: "https://api.twitch.tv/helix/users",
    scope: "user:read:email",
    clientIdHeader: "Client-Id",
    profile: (b) => {
      const u = b?.data?.[0];
      return text(u?.id) ? { subject: u.id, name: text(u.display_name) ?? text(u.login) ?? "Planter", email: text(u.email), ...(text(u.email) ? { emailVerified: true } : {}), ...(text(u.profile_image_url) ? { avatarUrl: u.profile_image_url } : {}), ...(typeof u.description === "string" ? { bio: u.description } : {}), ...(text(u.login) ? { login: u.login } : {}) } : undefined;
    },
  },
  discord: {
    label: "Discord",
    envPrefix: "DISCORD",
    authorize: "https://discord.com/oauth2/authorize",
    token: "https://discord.com/api/oauth2/token",
    userinfo: "https://discord.com/api/users/@me",
    scope: "identify email",
    profile: (b) => (text(b?.id) ? { subject: b.id, name: text(b.global_name) ?? text(b.username) ?? "Planter", email: text(b.email), ...(text(b.avatar) && /^\d+$/.test(b.id) && /^[a-zA-Z0-9_]+$/.test(b.avatar) ? { avatarUrl: `https://cdn.discordapp.com/avatars/${b.id}/${b.avatar}.png?size=256` } : {}) } : undefined),
  },
} as const satisfies Record<string, Provider>;

export type ProviderId = keyof typeof PROVIDERS;
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export function isProvider(id: string): id is ProviderId {
  return Object.hasOwn(PROVIDERS, id);
}

function credentials(id: ProviderId, env: Deps["env"]): { clientId: string; clientSecret: string } | undefined {
  const prefix = PROVIDERS[id].envPrefix;
  const clientId = env[`${prefix}_CLIENT_ID`];
  const clientSecret = env[`${prefix}_CLIENT_SECRET`];
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

/** Whether a provider has its keys. Unconfigured providers are shown but switched off. */
export function isConfigured(id: ProviderId, env: Deps["env"] = process.env): boolean {
  return credentials(id, env) !== undefined;
}

const ASK_EVERY_TIME: Record<ProviderId, Record<string, string>> = {
  google: { prompt: "select_account" },
  twitch: { force_verify: "true" },
  discord: { prompt: "consent" },
};

/** Where to send the browser to start signing in. */
export function authorizeUrl(id: ProviderId, redirectUri: string, state: string, env: Deps["env"] = process.env): string {
  const creds = credentials(id, env);
  if (!creds) throw new Error(`${PROVIDERS[id].label} sign-in is not set up`);
  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: PROVIDERS[id].scope,
    state,
  });
  // Always show the provider's account picker, so a remembered approval
  // never signs someone in without a click on their part.
  for (const [key, value] of Object.entries(ASK_EVERY_TIME[id])) params.set(key, value);
  return `${PROVIDERS[id].authorize}?${params}`;
}

/** Swaps the code from the callback for the person's profile. */
export async function fetchProfile(id: ProviderId, code: string, redirectUri: string, deps: Deps): Promise<Profile> {
  const provider: Provider = PROVIDERS[id];
  const creds = credentials(id, deps.env);
  if (!creds) throw new Error(`${provider.label} sign-in is not set up`);
  const tokenRes = await deps.fetch(provider.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) throw new Error(`${provider.label} rejected the sign-in`);
  const accessToken = text(((await tokenRes.json()) as { access_token?: unknown }).access_token);
  if (!accessToken) throw new Error(`${provider.label} returned no access token`);

  const profileRes = await deps.fetch(provider.userinfo, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(provider.clientIdHeader ? { [provider.clientIdHeader]: creds.clientId } : {}),
    },
  });
  if (!profileRes.ok) throw new Error(`Could not read your ${provider.label} profile`);
  const profile = provider.profile(await profileRes.json());
  if (!profile) throw new Error(`${provider.label} returned an unreadable profile`);
  return { ...profile, name: profile.name.slice(0, 24) };
}
