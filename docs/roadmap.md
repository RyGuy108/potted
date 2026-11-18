# Roadmap

Each feature is its own branch, stacked on the one before, so every pull
request shows one change. Merge from the top of the list down.

## The stack

| # | Branch | What it adds | State |
| --- | --- | --- | --- |
| 1 | `main` | Workspace, CI, architecture notes | Done |
| 2 | `feat/core-verifier` | Challenge rules, and result checking for Lichess, Brawl Stars, Fortnite and clips | Done |
| 3 | `feat/escrow-program` (off `main`) | Solana escrow program, including streamer `cancel` | Compiles; Anchor tests not yet run |
| 4 | `feat/web-app` | Fan pages, dashboard, overlay, simulated ledger | Done |
| 5 | `feat/ui-refresh` | Navy glass design | Done |
| 6 | `feat/streamer-controls` | Settings, fan suggestions, cancel and refund, run again | Done |
| 7 | `feat/announcer-milestones` | Growth milestones, voice choice, spoken recap | Done |
| 8 | `feat/fan-garden-share` | Fan garden, share image, overlay QR | Done |
| 9 | `feat/coordinator` | Grok drafts terms and the moderator checklist | Done; live Grok calls untested (needs a key) |
| 10 | `feat/chain-events` | QuickNode Streams webhook, event decoder, public activity page | Done; not yet run against a live Stream |
| 11 | `feat/collabs` | Invite another streamer, split the pot, show on both stages | Done on the simulated ledger |
| 12 | `feat/charity-streams` | A cause share on every completed pot, totals on page and overlay | Done on the simulated ledger |
| 13 | `feat/stream-directory` | More stream types behind "Show more" | Done |
| 14 | `feat/any-game` | Steam achievement checker, proof rules on clips, fan-named games | Done; Steam untested live (needs a key) |
| 15 | `feat/accounts-and-home` | Google, Twitch and Discord sign-in, planter and climber roles, a signed-in home, a gamified garden, the games marquee | Done; providers untested live (need keys) |
| 16a | `feat/browse-and-polish` | A page per game listing who is live, browse, header search, more badges, tiles for previous challenges, logo and log-in button | Done |
| 16b | `feat/role-activity` | Analytics per account type; role and balance out of the header | Done |
| 16c | `feat/extension` | Chrome side-panel extension and the JSON API it uses | Done; tested as an unpacked extension in Chrome for Testing |
| 16d | `feat/bounty-board` | Planters put money on an idea; it becomes a challenge if the climber takes it on, or is refunded on decline or expiry | Done on the simulated ledger |
| 16 | `feat/solana-ledger` | Real devnet transactions, sponsored fees, explorer links on receipts | Needs the deployed program |
| 17 | `feat/program-splits` | Guest and cause shares paid by the escrow program itself | After 16, touches the program |
| 18 | `feat/solana-pay` | Pledge from a QR code or a link (Solana Pay, Blinks) | After 16 |
| 19 | `feat/embedded-wallets` | A real Solana wallet made for each signed-in account (Privy) | Needs a Privy app id |
| 20 | `feat/stretch-tiers` | Several pot sizes on one challenge, each unlocking more | After 16, touches the program |
| 21 | `feat/funder-beans` | A compressed NFT for funders of a completed challenge | After 16 |

## Where new code plugs in

These seams are why the remaining branches stay small.

- **Ledger** (`apps/web/src/lib/ledger.ts`). Every money movement goes through
  the `Ledger` interface. Branch 11 adds a second implementation; no page or
  use case changes.
- **Events** (`emit` in `apps/web/src/lib/service.ts`). The overlay, announcer
  and recap all read one event feed. Branch 10 adds on-chain events to the
  same feed, so the overlay needs no new code to show them.
- **Verifier adapters** (`packages/verifier`). A new game is one file that
  implements `Adapter`, plus one line in `GAMES`.
- **Coordinator** (`packages/coordinator`). Advice only. Anything it drafts
  goes through the same form and the same `parseCondition` check as terms
  typed by hand, and it has no access to the ledger.
- **Splits** (`splitPot` in `packages/core`). Collabs and charity streams are
  both entries in one `splits` list on the challenge, fixed when it opens.
  Any new way of sharing a pot is another entry, not another payout path.
- **Session** (`apps/web/src/lib/session.ts`). Pages ask for `currentUser()`.
  Branch 13 changes how that user is found, not who calls it.
- **Store** (`apps/web/src/lib/store.ts`). One module owns persistence, so
  moving from the JSON file to Postgres for hosting touches one file.

## What each remaining branch needs from outside

| Branch | Needs |
| --- | --- |
| 10 | A QuickNode Stream pointed at the webhook (docs/quicknode.md) and `QUICKNODE_WEBHOOK_SECRET` |
| 14 | `STEAM_API_KEY` to check real achievements |
| 16 | `anchor build`, `anchor keys sync`, `anchor test` and `anchor deploy` run locally; then `POTTED_PROGRAM_ID` and `VERIFIER_SECRET_KEY` |
| 17 | A verified wallet address per cause, before real money is sent to one |
| 19 | A Privy app id |
| Hosting | A database, because the JSON file store does not persist on serverless hosts |
