# Keys and accounts

Everything runs with no keys at all: the simulated ledger, the demo
accounts, rule-based drafting and the browser's own voice. Each key below
switches one real integration on. Keys go in `apps/web/.env.local`, one
per line as `NAME=value` with no quotes, and the server is restarted
after a change. That file is ignored by git; never paste keys into chat,
a commit or a pull request.

    cd apps/web
    cp ../../.env.example .env.local   # first time only
    open -e .env.local                 # edit, save, restart the server

## For the demo video

| What it turns on | Variable | Where to get it |
| --- | --- | --- |
| Google sign-in | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | console.cloud.google.com → APIs & Services → Credentials → Create credentials → OAuth client ID → Web application. Authorized redirect URI: `http://localhost:3000/api/auth/google/callback`. You are asked to set up the consent screen first; choose External and add your own address as a test user. |
| Twitch sign-in | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | dev.twitch.tv/console → Register Your Application. OAuth redirect URL: `http://localhost:3000/api/auth/twitch/callback`. Category: Website Integration. Then Manage → New Secret. |
| Announcer voices, milestone sound effects, streamers' own cloned voices | `ELEVENLABS_API_KEY` | elevenlabs.io → your profile → API Keys → Create. Give the key Text to Speech, Sound Effects and Voices (write) access. Voice cloning needs a plan that includes Instant Voice Cloning. |
| Grok drafting and moderator checklist | `XAI_API_KEY` | console.x.ai → API Keys → Create. Set `XAI_MODEL` if your account lists a different model name than `grok-4.7`. |
| Rehearsal buttons (simulate a win or a miss) | `POTTED_ALLOW_SIMULATED_RESULTS=true` | No account. Leave it `false` for anything public. |

## For real results from games

| What it turns on | Variable | Where to get it |
| --- | --- | --- |
| Chess | none | Lichess's public API needs no key. `LICHESS_TOKEN` is optional and only raises rate limits (lichess.org → Preferences → API access tokens). |
| Brawl Stars | `BRAWLSTARS_API_KEY` | developer.brawlstars.com → My Account → Create New Key. The key only works from the IP addresses you list, so add your current public IP, and the host's when deployed. |
| Fortnite | `FORTNITE_API_KEY` | dash.fortnite-api.com → sign in → API key. The player's stats must be public in Fortnite's settings. |
| Any Steam game | `STEAM_API_KEY` | steamcommunity.com/dev/apikey. The streamer's profile and game details must be public. |
| Twitch stream goals (stay live N minutes, reach N viewers) | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | The same Twitch app as sign-in. The checker uses an app token, so no extra scope. |

## For Solana and QuickNode

The app runs on the simulated ledger until these are set. Do them in
this order (commands from the repo root unless noted):

1. **Deploy the program.** Follow `programs/escrow/README.md` on the
   `feat/escrow-program` branch. `anchor deploy` prints the program id.
2. **Make the server key**, which pays fees, reports results and runs the
   test USDC faucet:
   `solana-keygen new -o ~/potted-verifier.json`, then
   `solana airdrop 2 $(solana-keygen pubkey ~/potted-verifier.json) --url devnet`
   (or use faucet.solana.com).
3. **Fill in `.env.local`:**

   | Variable | Value |
   | --- | --- |
   | `POTTED_PROGRAM_ID` | The id from step 1 |
   | `VERIFIER_SECRET_KEY` | The whole contents of `~/potted-verifier.json`, the `[12,34,…]` list |
   | `SOLANA_RPC_URL` | `https://api.devnet.solana.com`, or a QuickNode devnet endpoint for fewer rate limits |

4. **Create the test USDC mint:** from `apps/web`, run
   `pnpm solana:setup`. It prints a `USDC_MINT=` line; put it in
   `.env.local`.
5. **Switch the app over:** set `POTTED_LEDGER=solana` and restart. Every
   account, including the demo ones, gets a devnet wallet, and receipts
   link to Solana Explorer.

By default, wallets in this mode are custodial: the server holds each
account's key in `.data/wallets.json` and signs for it. With Privy set up
(below), accounts that sign in for real (email, Google, Twitch, Discord)
get a wallet made by Privy instead, and the server asks Privy to sign
their transactions. The demo and test accounts stay custodial.

| Turns on | Variable | Where to get it |
| --- | --- | --- |
| Privy wallets | `PRIVY_APP_ID`, `PRIVY_APP_SECRET` | dashboard.privy.io → create an app → Settings → Basics shows the App ID and App secret. Under Wallets, make sure server-side wallet creation is allowed. Only used with `POTTED_LEDGER=solana`. |

| Turns on | Variable | Where to get it |
| --- | --- | --- |
| On-chain activity page, and pledge alerts carried by the Stream (with their speed on the overlay) | `QUICKNODE_WEBHOOK_SECRET` | quicknode.com → Streams → create a Stream (steps in `docs/quicknode.md`) → Settings → Security token. Needs `POTTED_PROGRAM_ID` too. |
| Charity Stream (USDC arriving at causes' wallets) | `QUICKNODE_CAUSES_SECRET` | A second Stream; see `docs/quicknode.md`. |
| Grok posts on X from on-chain moments | `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`, `POTTED_X_POSTS=auto` | console.x.com → your app → Keys and tokens: the API key and secret, then generate an Access Token and Secret for Potted's own account with Read and Write permission. Pay-per-use: about $0.20 per post with a link. Without `POTTED_X_POSTS=auto`, posts stay as drafts on /activity. |
| `!potted` bot on Twitch | `TWITCH_BOT_USERNAME`, `TWITCH_BOT_TOKEN` | Make a Twitch account for the bot, then a user access token for it with the `chat:read chat:edit` scopes (for example with the Twitch CLI: `twitch token -u -s 'chat:read chat:edit'`). The bot joins every streamer's linked Twitch channel. |
| `!potted` bot on Kick | `KICK_CLIENT_ID`, `KICK_CLIENT_SECRET` | Turn on two-factor sign-in on your Kick account, then kick.com/settings/developer → create an app. Redirect URL `https://<domain>/api/connect/kick/callback`, scopes `user:read channel:read chat:write events:subscribe`, webhooks on with URL `https://<domain>/api/webhooks/kick`. Streamers press "Connect Kick" on their Channel page. |
| `!potted` bot on YouTube | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (the sign-in ones) | In Google Cloud, enable the YouTube Data API v3 and add `https://<domain>/api/connect/youtube/callback` as a redirect URI. Streamers press "Connect YouTube"; the bot reads their live chat while they are live on YouTube. Each read costs YouTube API quota, so it reads every 8 seconds at most. |
| Pledge from X (Solana Actions / Blinks) | `POTTED_PUBLIC_URL` | Nothing to sign up for. Wallets and X need a public https address, so run the app behind a tunnel (e.g. `cloudflared tunnel --url http://localhost:3000`) and set this to it. To unfurl on X itself, register the domain at dial.to/register; "Open the Blink" on a challenge page works without that. |

## Email sign-in

Email sign-in works with no key on a development server: with no mail
service connected, the code is shown on screen. To mail it:

| Turns on | Variable | Where to get it |
| --- | --- | --- |
| Sign-in codes by email | `RESEND_API_KEY`, optionally `EMAIL_FROM` | resend.com → API Keys → Create. Without a verified domain Resend only delivers to your own address; `EMAIL_FROM` defaults to `Potted <onboarding@resend.dev>`. |

A production server never shows codes unless `POTTED_SHOW_EMAIL_CODES=true`.

## Supabase (off-chain data)

Without these, everything is kept in `apps/web/.data/potted.json`. With
them, the app loads its state from Supabase when it starts and writes
every change back, so it survives redeploys and serverless hosts.

1. supabase.com → New project.
2. SQL Editor → paste `supabase/migrations/20261118000000_potted.sql` →
   Run. It creates `profiles`, `challenges`, `pledges`, `clips` and
   `app_state`, with row level security on.
3. Project Settings → API: copy the Project URL and the `service_role`
   key into `.env.local`:

   | Variable | Value |
   | --- | --- |
   | `SUPABASE_URL` | `https://<project>.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | The `service_role` key (secret: server only, never in the browser) |

4. Restart. On the first start Supabase is empty, so the app pushes what
   the local file holds; after that Supabase is the source. The sample
   script reads and writes Supabase too.

## For hosting

| Variable | Value |
| --- | --- |
| `POTTED_PUBLIC_URL` | The site's address, e.g. `https://potted.example.com`. Also add this address's callback URLs to each sign-in provider. |
| `SESSION_SECRET` | A long random string: `openssl rand -hex 32`. |

## Optional

| Variable | What it does |
| --- | --- |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Discord sign-in. discord.com/developers → New Application → OAuth2. Redirect: `http://localhost:3000/api/auth/discord/callback`. |
| `ELEVENLABS_VOICE_ID` | Use one custom voice for every stream, overriding the streamer's choice. |

## Running it for real: one server, the background job, Blink limits

**Exactly one server.** All data lives in `POTTED_DATA_DIR` (`potted.json` and the custodial wallet keys `wallets.json`). On Railway: one service, a volume at `/data`, `POTTED_DATA_DIR=/data`, replicas = 1. On start the server claims the folder (`server.lock`, refreshed every 15s) and logs an error if another live server holds it. Supabase, if set, is a mirror that the server loads back on start, not a second writer.

**Backups.** Every hour, `potted.json` and `wallets.json` are copied to `/data/backups/` (the newest 48 of each are kept; wallet copies are owner-only). To restore: stop the service, copy a backup over `potted.json`, start it.

**Background job.** Every 20s the server expires old requests, refunds challenges past their deadline, checks results, and releases held overlay lines, with no page load needed. `POTTED_TICK_MS` changes the interval; `POTTED_SCHEDULER=off` turns it off.

**Health.** `GET /api/health` shows the background job, last save, last backup, and a warning if a second server shares the data. Point Railway's health check at it.

**Blink limits** (each Blink pledge costs the server a fee and may top the wallet up with test USDC):

| Variable | Default | Meaning |
|---|---|---|
| `POTTED_BLINK_PER_WALLET` | 10 | pledges per wallet per hour |
| `POTTED_BLINK_PER_IP` | 30 | pledges per network address per hour |
| `POTTED_BLINK_PER_HOUR` | 300 | pledges from everyone per hour |
| `POTTED_BLINK_TOPUP_USD` | 25 | test USDC the faucet gives a wallet, ever |
