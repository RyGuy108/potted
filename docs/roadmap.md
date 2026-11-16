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
| 10 | `feat/chain-events` | QuickNode Streams webhook feeding the overlay and a public activity page | Next |
| 11 | `feat/solana-ledger` | Real devnet transactions, sponsored fees, explorer links on receipts | Needs the deployed program |
| 12 | `feat/solana-pay` | Pledge from a QR code or a link (Solana Pay, Blinks) | After 11 |
| 13 | `feat/privy-auth` | Email or Google sign-in with a wallet made for the fan | Needs a Privy app id |
| 14 | `feat/stretch-tiers` | Several pot sizes on one challenge, each unlocking more | After 11, touches the program |
| 15 | `feat/funder-beans` | A compressed NFT for funders of a completed challenge | After 11 |

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
- **Session** (`apps/web/src/lib/session.ts`). Pages ask for `currentUser()`.
  Branch 13 changes how that user is found, not who calls it.
- **Store** (`apps/web/src/lib/store.ts`). One module owns persistence, so
  moving from the JSON file to Postgres for hosting touches one file.

## What each remaining branch needs from outside

| Branch | Needs |
| --- | --- |
| 10 | A QuickNode Streams endpoint pointed at the app's webhook URL, and `QUICKNODE_WEBHOOK_SECRET` |
| 11 | `anchor build`, `anchor keys sync`, `anchor test` and `anchor deploy` run locally; then `POTTED_PROGRAM_ID` and `VERIFIER_SECRET_KEY` |
| 13 | A Privy app id |
| Hosting | A database, because the JSON file store does not persist on serverless hosts |
