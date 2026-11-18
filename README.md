# Potted

Fan-funded stream challenges that settle on evidence.

Fans chip into a pot for a challenge the streamer agrees to attempt. The pot
sits in escrow. If the challenge is verified, the streamer is paid. If it
fails or the deadline passes, every fan is refunded. Each settlement keeps a
receipt that points at the evidence, so anyone can check why money moved.

The mascot is a beanstalk: every pledge is a magic bean, and the stalk climbs
toward the clouds as the pot fills.

Built for the University Blockchain Conference 2026 hackathon
(Consumer Applications track, Solana).

## Grok's role

Grok is the climber's scout and the platform's coordinator. On the climber
dashboard it searches X and the web for what is popular in the streamer's
games this week, weighs that against the stream's own record and the escrow
activity QuickNode streams in from Solana, and pitches ready-to-run
challenges with a line to post on X; with autopilot on, it opens the next
pitch itself whenever the stage is empty and the overlay announces it. Grok
also turns fans' loose ideas into exact, checkable terms and briefs keepers
on what to look for in a disputed clip, while the app checks every value it
returns and never lets it move money or rule. Details: `docs/grok.md`.

## How a challenge works

1. **Proposed** by a fan or the streamer, as a precise condition.
2. **Approved** by the streamer, who picks a deadline.
3. **Funded** by fans in USDC. Pledges sit in an escrow vault.
4. **Attempted** on stream before the deadline.
5. **Settled** from evidence: the streamer is paid, or fans are refunded.

## Verification tiers

One escrow serves every game. Only the verifier plugged into it changes.

| Tier | How it decides | Games in this repo |
| --- | --- | --- |
| Data | Reads a public game or stream API and checks a precise condition | Chess (Lichess), Brawl Stars, Fortnite, any Steam achievement, Twitch stream goals |
| Optimistic | Streamer claims with a clip; settles unless a funder disputes in time | GTA VI and any game without a data source |

See [docs/architecture.md](docs/architecture.md) for the trust boundary and
the anti-collusion rules.

## Three ways to take part

| | Pays | Otherwise |
| --- | --- | --- |
| **Fund a request**: ask for a specific challenge and put money on it | When the streamer takes it on and starts the attempt, whatever the result | Refunded if they pass or never start; the fan can send it on as a tip |
| **Back a challenge**: add to the pot of an open challenge | Only if the streamer completes it (held by the escrow program) | Refunded on a miss |
| **Tip**: support the streamer directly | Straight away | Not refundable |

## Architecture

| Component | What it does | Where |
| --- | --- | --- |
| Escrow program | Holds pledges; enforces payout and refund rules (Open → Locked → Paid or Refunded) | `programs/escrow` on `feat/escrow-program`; Anchor, USDC, devnet |
| Verifier service | One adapter per tier checks results and signs settlements | `packages/verifier`: Lichess, Brawl Stars, Fortnite, Steam, Twitch stream, optimistic claim and dispute |
| Fan web app | Email (and Google, Twitch, Discord) sign-in, pledges, challenge pages with receipts | `apps/web`; Privy wallets when configured, prices in dollars |
| Streamer dashboard | Accepted challenge types, approval queue, campaigns, payouts | `apps/web/src/app/(site)/dashboard` |
| Stream overlay | Live funding bars and paid or refunded alerts | QuickNode Stream on the program's events → `/api/webhooks/quicknode` → `/overlay/<handle>` |
| Voice announcer | Reads pledges and results aloud | ElevenLabs via `/api/tts` |
| Hype assistant | Turns fan ideas and X chatter into checkable terms, pitches them for approval, opens them through the app, writes the stream recap | Grok, `packages/coordinator` |
| Off-chain data | Profiles, challenge text, pledges, clips | Supabase (`supabase/migrations`), or a local JSON file with no keys |

## Repository layout

```
apps/web            Next.js app: fan pages, streamer dashboard, stream overlay
apps/extension      Chrome side panel for planters
packages/core       Domain model: challenges, conditions, money, state machine
packages/verifier   Verifier engine and one adapter per game (Lichess, Brawl Stars, Fortnite, Steam, Twitch, clips)
packages/coordinator Grok: drafts terms, scouts challenges, writes recaps, briefs keepers
packages/chain      Escrow event decoder and QuickNode Streams webhook
supabase/           Postgres tables for off-chain data
programs/escrow     Anchor program: USDC escrow with payout and refund rules
tests/              Anchor integration tests for the escrow program
docs/               Architecture and demo notes
```

## Getting started

Requirements: Node 20+, pnpm 10+. The escrow program also needs Rust, the
Solana CLI and Anchor 0.32.

```bash
pnpm install
pnpm test          # unit tests
pnpm dev           # web app on http://localhost:3000
pnpm --filter @potted/web sample   # optional: demo accounts and history (stop the dev server first)
```

Copy `.env.example` to `apps/web/.env.local` and fill in what you need. The
app runs with no keys at all: the default ledger is a local simulation, and
Lichess needs no key.

## Status

This is a hackathon prototype. Pledges use devnet USDC, there is no card
on-ramp yet, and one verifier key signs results. The architecture doc lists
what is simulated and what comes next.
