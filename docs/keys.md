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
| Announcer voices | `ELEVENLABS_API_KEY` | elevenlabs.io → your profile → API Keys → Create. |
| Grok drafting and moderator checklist | `XAI_API_KEY` | console.x.ai → API Keys → Create. Set `XAI_MODEL` if your account lists a different model name than `grok-4.7`. |
| Rehearsal buttons (simulate a win or a miss) | `POTTED_ALLOW_SIMULATED_RESULTS=true` | No account. Leave it `false` for anything public. |

## For real results from games

| What it turns on | Variable | Where to get it |
| --- | --- | --- |
| Chess | none | Lichess's public API needs no key. `LICHESS_TOKEN` is optional and only raises rate limits (lichess.org → Preferences → API access tokens). |
| Brawl Stars | `BRAWLSTARS_API_KEY` | developer.brawlstars.com → My Account → Create New Key. The key only works from the IP addresses you list, so add your current public IP, and the host's when deployed. |
| Fortnite | `FORTNITE_API_KEY` | dash.fortnite-api.com → sign in → API key. The player's stats must be public in Fortnite's settings. |
| Any Steam game | `STEAM_API_KEY` | steamcommunity.com/dev/apikey. The streamer's profile and game details must be public. |

## For Solana and QuickNode

| What it turns on | Variable | Where to get it |
| --- | --- | --- |
| Real devnet transactions | `POTTED_PROGRAM_ID` | Printed by `anchor deploy` after `anchor build && anchor keys sync`. |
| | `VERIFIER_SECRET_KEY` | A new keypair for the server to sign settlements with: `solana-keygen new -o verifier.json`, then paste the file's contents. Fund it with `solana airdrop 2 <address> --url devnet`. |
| | `POTTED_LEDGER=solana` | Set last. The app refuses to start in this mode until the Solana ledger branch is merged. |
| On-chain activity page | `QUICKNODE_WEBHOOK_SECRET` | quicknode.com → Streams → create a Stream (steps in `docs/quicknode.md`) → Settings → Security token. Needs `POTTED_PROGRAM_ID` too. |

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
