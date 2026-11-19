# Pledge from X: Solana Actions (Blinks)

Every open challenge is a Solana Action. Post its page on X and, where
Blinks unfurl, it becomes a card with "Pledge $1 / $5 / $10" buttons and
an amount box. The fan signs with their own wallet (Phantom, Backpack,
Solflare) without opening Potted.

- `GET /actions.json` maps `/c/<id>` to the Action.
- `GET /api/actions/pledge/<id>` is the card: title, description, a square
  image of the pot, and the buttons. It is turned off once pledging closes,
  or when the server runs the simulated ledger.
- `POST /api/actions/pledge/<id>?amount=5` with `{ account }` checks the
  pledge against the same rules as a pledge on the site (per-fan limit,
  smallest pledge, deadline) and returns a transaction for the wallet to
  sign. The server pays the fee and rent. On devnet, a wallet short of test
  USDC gets the difference from the faucet inside the same transaction, so a
  fresh wallet works.
- After it confirms, the wallet calls `POST /api/actions/pledge/<id>/confirm`
  with the signature. The server reads the transaction back from the chain
  (it never trusts the request), and books the pledge under a planter named
  after the wallet ("7xKX…gAsU"). The QuickNode Stream can book it too;
  either way it counts once.

The challenge page shows "Pledge from X" with Post on X, Open the Blink
(Dialect's viewer, which works without registering) and the Action link.

Wallets and X can only reach a public https address: see
`POTTED_PUBLIC_URL` in `docs/keys.md`.
