# Potted

Fan-funded stream challenges that settle on evidence.

Fans chip into a pot for a challenge the streamer agrees to attempt. The pot
sits in escrow. If the challenge is verified, the streamer is paid. If it
fails or the deadline passes, every fan is refunded. Each settlement keeps a
receipt that points at the evidence, so anyone can check why money moved.

The mascot is a money tree: every pledge waters the pot, and the plant grows
as the pot fills.

Built for the University Blockchain Conference 2026 hackathon
(Consumer Applications track, Solana).

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
| Data | Reads a public game API and checks a precise condition | Chess (Lichess), Brawl Stars, Fortnite |
| Optimistic | Streamer claims with a clip; settles unless a funder disputes in time | GTA VI and any game without a data source |

See [docs/architecture.md](docs/architecture.md) for the trust boundary and
the anti-collusion rules.

## Repository layout

```
apps/web            Next.js app: fan pages, streamer dashboard, stream overlay
packages/core       Domain model: challenges, conditions, money, state machine
packages/verifier   Verifier engine and one adapter per game
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
```

Copy `.env.example` to `apps/web/.env.local` and fill in what you need. The
app runs with no keys at all: the default ledger is a local simulation, and
Lichess needs no key.

## Status

This is a hackathon prototype. Pledges use devnet USDC, there is no card
on-ramp yet, and one verifier key signs results. The architecture doc lists
what is simulated and what comes next.
