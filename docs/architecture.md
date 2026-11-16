# Architecture

## Components

```
Fan web app ─────────┐
                     ├──▶ Escrow program (Solana, USDC vault) ──▶ events ──▶ Stream overlay
Streamer dashboard ──┘              ▲
                                    │ signed result + evidence reference
                             Verifier service ◀── Game APIs (Lichess, Brawl Stars, Fortnite)
                                                  or an optimistic claim with a clip
```

- **Escrow program** (`programs/escrow`): one account per challenge with a
  USDC vault. States: `Open → Locked → Paid`, or `→ Failed` and refunds.
- **Verifier** (`packages/verifier`): an adapter per game turns a condition
  and the game's data into a verdict with an evidence reference.
- **Web app** (`apps/web`): fan pages, the streamer dashboard and the
  overlay, which is a plain web page added to OBS as a browser source.
- **Core** (`packages/core`): shared types and rules used by all of the above.

## Trust boundary

The program cannot see a chess game. It enforces rules about money; the
verifier reports what happened.

| Trusted | Not trusted |
| --- | --- |
| The verifier key reads the evidence and signs the result. | The streamer cannot withdraw early. |
| | Nobody can settle a challenge twice. |
| | After `settle_by`, anyone can trigger refunds, even if our servers are down. |

Every settlement stores an evidence reference (for example a Lichess game
id), so funders can recheck the result themselves.

Planned: several independent verifiers that must agree, or cryptographic
proofs of the API response, in place of the single key.

## Anti-collusion rules

A streamer could ask a friend to lose on purpose. The adapters ignore games
that are easy to arrange:

- **Lichess**: only rated games paired by matchmaking (`source: pool`) count.
  Direct challenges are ignored. Aborted games and games shorter than a
  minimum number of moves are ignored. An opponent rating floor is optional.
- **Brawl Stars**: friendly battles are ignored.
- **Fortnite**: the public API exposes totals, not single matches, so the
  check is a change in totals between lock and deadline. This is the weakest
  data adapter and is documented as such in the UI.
- **Optimistic**: any funder can dispute within the window; disputes go to a
  moderator.

## What is simulated today

- USDC is devnet USDC. There is no card on-ramp.
- The default ledger (`POTTED_LEDGER=sim`) keeps balances in the local store
  so the UI can be developed without a chain. Receipts from it are labelled
  as simulated.
