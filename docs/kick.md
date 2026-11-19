# Kick

Streamers connect their Kick channel on **Channel → Kick**. Then:

- `!potted` (or `!pot`) in their Kick chat gets one reply: the open
  challenge, its pot, and the link to back it, `/j/<handle>`.
- `!potted top` gets the top planters by display name (never emails or
  wallets).
- Optional announcements, each off until turned on: attempt started, pot
  reached its goal, final result. They come only from Potted's own
  challenge events.
- The card shows the connected channel, live/offline (or "unknown" when
  Kick could not be read), chat-event subscription health, the last event
  and message, and buttons for a test message (asks first; it is public),
  Repair connection, Reconnect and Disconnect.

Kick chat, follows and live status never count as evidence for a
challenge. Game verifiers and escrow rules decide results.

## Setting it up (site owner)

Use your live origin, the value of `POTTED_PUBLIC_URL`. For the Railway
site that is `https://potted-production-25981257.up.railway.app`; check the
domain on the service's Settings → Networking in Railway first.

1. On Kick, turn on two-factor authentication (Settings → Security).
2. Go to <https://kick.com/settings/developer> → Create new app.
   - Name: Potted. Description and app URL: your origin.
   - Redirect URL: `<origin>/api/connect/kick/callback`
   - Scopes: `user:read`, `channel:read`, `chat:write`, `events:subscribe`
     (nothing else).
   - Enable webhooks, URL: `<origin>/api/webhooks/kick`
3. Copy the Client ID and Client Secret.
4. In Railway, on the Potted service → Variables, add `KICK_CLIENT_ID` and
   `KICK_CLIENT_SECRET`, and make sure `POTTED_PUBLIC_URL` is your origin
   (no trailing slash) and `SESSION_SECRET` is set. Railway redeploys.
   Optionally add `POTTED_TOKEN_KEY` (see `docs/keys.md`).
5. Locally, add the same two lines to `apps/web/.env.local` (do not replace
   the file) and run `pnpm --filter @potted/web keys`; it lists what is
   missing without showing values. Kick cannot reach `localhost`, so test
   webhooks through a tunnel with a separate development Kick app; changing
   the production app's webhook URL moves its events away from the site.

There is no webhook secret to copy: Kick signs every webhook with its RSA
key, which Potted fetches from `https://api.kick.com/public/v1/public-key`.

## How it works

- Connect: OAuth 2.1 code flow with PKCE (S256). The state is in a
  10-minute cookie bound to the signed-in climber; the callback refuses a
  different state or a different user. Tokens are sealed with AES-256-GCM
  (`src/lib/secret-box.ts`) on the streamer's own account. One Kick channel
  can be connected to one Potted account.
- After connecting, Potted subscribes (with the streamer's token) to
  `chat.message.sent` and `livestream.status.updated`, version 1, creating
  only missing ones and keeping the returned ids. Repair does the same.
  Kick drops a subscription after a day of failed deliveries; Repair puts
  it back.
- Webhooks: the raw body is verified (RSA PKCS#1 v1.5, SHA-256 over
  `<Kick-Event-Message-Id>.<Kick-Event-Message-Timestamp>.<body>`), then
  type and version, timestamp (older than 1 hour or over 5 minutes ahead:
  acknowledged, not acted on), duplicate message id (kept 3 hours, saved),
  broadcaster and subscription id. What to send is saved in an outbox
  before Kick gets its 200.
- Sending: the outbox sends with the streamer's own token, `type: "bot"`,
  at most one message per 1.5 s per channel, cut to 500 characters and
  2048 bytes, checking `data.is_sent`. On 429 it waits for `Retry-After`
  (or backs off). Before each send it checks again that Kick is still
  connected and that commands or that announcement are still on. Replies
  older than 2 minutes are dropped rather than sent late.
- Cooldowns: each command answers at most once per 15 s per channel and
  once per 30 s per viewer. The bot never answers its own messages.
- Tokens refresh a minute before expiry, one refresh at a time. If Kick
  refuses the refresh token, the card asks the streamer to reconnect.
- Disconnect drops queued messages and the connection first, then deletes
  the subscriptions and revokes both tokens at Kick.
- Single server: like the rest of Potted's file store, this assumes one
  Railway replica.

## Live acceptance test (not yet run against real Kick)

Automated tests (`apps/web/test/kick.test.ts`) use stand-ins for Kick.
These steps need the real service:

1. With the variables set and the site redeployed, sign in as a climber,
   open Channel → Kick, press Connect Kick, approve on Kick. Check the card
   shows the right channel and "Chat events: Subscribed". Nothing should
   have been posted in chat.
2. Press Send test message → Post it. Check it appears once in the right
   channel.
3. From a second Kick account, type `!potted` in the channel. Expect one
   reply with the right pot and a working `/j/<handle>` link. Type
   `!potted top`: display names only.
4. Go live and then offline on Kick; reload the Channel page each time and
   check the status follows.
5. Turn on "Announce: pot reached its goal", fill a pot to its goal through
   the normal pledge flow, and check one message appears.
6. Restart the Railway service; check the card still shows the connection
   and `!potted` still works. Leave it over 2 hours (token refresh) and try
   again.
7. Press Disconnect, then type `!potted`: no reply. Reconnect works again.
