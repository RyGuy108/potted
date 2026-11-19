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

## Garden badges as compressed NFTs

By default each earned badge is its own Token-2022 mint (soulbound, supply
one). With `POTTED_BADGES=compressed`, badges are minted as compressed NFTs
with Metaplex Bubblegum v2 instead (`apps/web/src/lib/badge-cnft.ts`):

- **One tree for every badge.** `pnpm badges:setup` creates a Merkle tree
  (depth 14: 16,384 badges) and pays its rent once. Each badge after that is
  a leaf in the tree: a transaction fee and no new accounts, so badges cost
  almost nothing per planter.
- **Soulbound.** The badges belong to an MPL-Core collection with the
  `BubblegumV2` plugin and a `PermanentFreezeDelegate` set to frozen, so no
  badge in it can be transferred or sold.
- **Same metadata.** Each leaf points at `/api/badges/<id>`, the same JSON
  and picture the Token-2022 badges use; the collection points at
  `/api/badges/collection`.
- **Finding them.** A compressed NFT has no token account; wallets and
  explorers read it through the DAS API. Use an RPC that offers it
  (QuickNode with the DAS add-on, Helius) to see badges in Phantom and on
  explorers. The garden links each badge to its asset id.

Badges already minted as Token-2022 stay as they are; new badges follow
the setting.
