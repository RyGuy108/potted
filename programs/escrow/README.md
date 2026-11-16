# Escrow program

USDC pots that pay out or refund on a verified result.

| Instruction | Who | What it does |
| --- | --- | --- |
| `create_challenge` | Streamer | Opens a challenge and its vault, and fixes the verifier, deadline and per-fan cap |
| `pledge` | Fan | Moves USDC into the vault while the challenge is open |
| `lock` | Streamer or verifier | Closes pledging when the attempt starts |
| `settle` | Verifier only | Reports the result once: success pays the pot to the streamer, failure opens refunds |
| `refund` | Anyone | Returns a fan's pledge after a failure, or after `settle_by` with no result |

Rules the tests cover:

- Only the verifier can settle, and only once.
- The pot can only go to the streamer's token account; a refund can only go to the fan who pledged.
- A result that arrives after `settle_by` is rejected, so it can never race the timeout refunds.
- A fee payer separate from the fan and streamer lets the app cover fees.

## Build, test, deploy

```bash
anchor build
anchor keys sync      # writes the real program id into lib.rs and Anchor.toml
anchor build
anchor test           # runs tests/escrow.ts against a local validator

solana config set --url devnet
anchor deploy --provider.cluster devnet
```
