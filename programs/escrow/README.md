# Escrow program

USDC pots that pay out or refund on a verified result.

| Instruction | Who | What it does |
| --- | --- | --- |
| `create_challenge` | Streamer | Opens a challenge and its vault, and fixes the verifier, deadline and per-fan cap |
| `set_splits` | Streamer | Fixes up to 4 shares (a collab guest, a cause) as whole percents, before anyone pledges |
| `pledge` | Fan | Moves USDC into the vault while the challenge is open |
| `lock` | Streamer or verifier | Closes pledging when the attempt starts |
| `cancel` | Streamer only | Calls the challenge off before a result; it can only open refunds, never pay out |
| `settle` | Verifier only | Reports the result once: success pays the pot to the streamer, failure opens refunds |
| `refund` | Anyone | Returns a fan's pledge after a failure, or after `settle_by` with no result |

Rules the tests cover:

- Only the verifier can settle, and only once.
- Shares are set once, before the first pledge, adding up to 90% at most.
  `lock` and `settle` always take the splits account at its fixed address,
  so a caller cannot skip it: each share is paid from the vault straight to
  that wallet's token account (checked against the wallet and the mint),
  rounded down, and the streamer gets the rest. Each payment emits
  `SharePaid`. The app's tests on a local validator cover this, including a
  payout that leaves a share's account out being refused.
- The pot can only go to the streamer's token account; a refund can only go to the fan who pledged.
- A result that arrives after `settle_by` is rejected, so it can never race the timeout refunds.
- A fee payer separate from the fan and streamer lets the app cover fees.

## Build, test, deploy

Tested with Agave (Solana CLI) 2.3.13, Anchor CLI 0.32.1 and Solana
platform-tools v1.52. All eight tests in `tests/escrow.ts` pass on a
local validator.

Use platform-tools v1.52 or newer. Older ones ship Cargo 1.84, which
cannot read some current dependencies (it fails with "feature
`edition2024` is required"). Plain `anchor build` uses whatever your
Solana install defaults to, so build the program and the IDL separately:

```bash
anchor keys sync                                    # first time: real program id into lib.rs and Anchor.toml
(cd programs/escrow && cargo-build-sbf --tools-version v1.52 --sbf-out-dir ../../target/deploy)
anchor idl build -o target/idl/escrow.json -t target/types/escrow.ts
anchor test --skip-build                            # starts a local validator and runs the tests
```

To deploy to devnet:

```bash
solana config set --url devnet
solana airdrop 2                                    # deploy costs about 2.4 SOL; repeat or use faucet.solana.com
anchor deploy --provider.cluster devnet
```

`Cargo.lock` pins `blake3` to 1.5.5, which keeps a newer hashing crate
out of the build. Leave it unless you also move to newer platform-tools.
