# What runs on Solana

| Piece | How |
| --- | --- |
| Escrow | The escrow program (branch `feat/program-splits` holds the program source). Pledges sit in a vault per challenge; only the verifier key can settle; refunds are a public crank. |
| Collab and charity shares | `set_splits` fixes up to 4 shares before the first pledge. `lock` and `settle` pay each share straight from the vault (one `SharePaid` event each) and the rest to the streamer. A cause can have its own wallet (Channel settings → Cause's Solana wallet); otherwise the server holds one for it, which is fine on devnet only. |
| Pledges from X | Solana Actions (Blinks): see `docs/blinks.md`. |
| Garden badges | Soulbound Token-2022 tokens, one per badge: name, picture link and badge id stored on the mint itself (metadata extension), the non-transferable extension so a badge cannot be sold or moved, and a supply of exactly one (the mint authority is dropped in the same transaction). Planters press "Put my badges on Solana" in their garden; the server pays. |

## Updating the program on devnet

The splits change adds an instruction and an account, and keeps every
existing instruction the same, so challenges opened before it keep working
(their shares are sent from the host's wallet after payout, as before).

From the `feat/program-splits` branch:

```bash
(cd programs/escrow && cargo-build-sbf --tools-version v1.52 --sbf-out-dir ../../target/deploy)
solana program deploy target/deploy/escrow.so --program-id target/deploy/escrow-keypair.json --url devnet
```

The app's copy of the program's interface (`apps/web/src/lib/escrow-idl.json`
and `escrow-types.ts`) is already updated.
