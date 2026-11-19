# QuickNode Streams

A Stream watches the escrow program and posts each of its transactions to
the app. The app decodes the program's events and shows them on
`/activity`, so the public record of pledges, payouts and refunds comes
from the chain, not from the app's own database.

## Setup

1. Deploy the escrow program and note its program id.
2. In the QuickNode dashboard, create a Stream:
   - Network: Solana devnet
   - Dataset: Block
   - Destination: Webhook, `https://<your-host>/api/webhooks/quicknode`
   - Filter: paste the function below, with your program id
3. Copy the Stream's security token from its Settings tab.
4. Set in `apps/web/.env.local`:

   ```
   POTTED_PROGRAM_ID=<program id>
   QUICKNODE_WEBHOOK_SECRET=<security token>
   ```

For local testing, expose the dev server with a tunnel (for example
`ngrok http 3000`) and use the tunnel address as the destination.

## Filter

The filter keeps only transactions that touch the program and sends the
few fields the app needs.

```js
function main(stream) {
  const PROGRAM_ID = "YOUR_PROGRAM_ID";
  const out = [];
  for (const block of stream.data) {
    for (const tx of block.transactions || []) {
      const logs = (tx.meta && tx.meta.logMessages) || [];
      if (tx.meta && tx.meta.err) continue;
      if (!logs.some((line) => line.startsWith("Program " + PROGRAM_ID + " invoke"))) continue;
      out.push({
        signature: tx.transaction.signatures[0],
        slot: block.parentSlot + 1,
        blockTime: block.blockTime,
        logs,
      });
    }
  }
  return out.length ? { data: out } : null;
}
```

## What the app checks

- **Signature.** Every delivery must carry a valid HMAC-SHA256 signature
  made with the security token. Unsigned or altered deliveries get a 401.
- **Origin of each event.** An event only counts if it was logged while
  the escrow program itself was executing, so another program cannot print
  a fake payout into a transaction.
- **Duplicates.** Streams redeliver on retries; each event is stored once.

## Not yet verified

The decoder and the signature check are tested against payloads built in
the test suite. They have not run against a live Stream, so the exact
shape of the Block dataset (field names in the filter above) should be
confirmed with the dashboard's "Test filter" button on first setup.


## Pledge alerts through the Stream

With `QUICKNODE_WEBHOOK_SECRET` set on the Solana ledger, a pledge's
overlay line waits for the Stream instead of going up as soon as the app
books it. When the delivery arrives, the line goes on screen with how long
it took from confirmation, for example "⚡ 1.0s from confirmation · via
QuickNode Streams". If the Stream has not delivered within 12 seconds, the
line goes up anyway, without a time.

The Stream also books pledges that wallets made on their own, from a
Blink, if the wallet's confirmation call has not already. Each
transaction is booked once, however many times it is delivered.


## Decoding inside QuickNode, and the charity Stream

Print both filters, generated from the same event layouts the app decodes
with, and paste each into its Stream:

```
pnpm --filter @potted/web quicknode filters
```

1. **Escrow Stream** (destination `/api/webhooks/quicknode`, token in
   `QUICKNODE_WEBHOOK_SECRET`). The filter decodes the program's events
   inside QuickNode, so deliveries carry ready-made Potted events (pledges,
   locks, results, refunds, splits and each `SharePaid`) instead of raw
   transactions. An event counts only while the escrow program itself was
   running, as in the app. The app still accepts raw transactions too.
2. **Charity Stream** (destination `/api/webhooks/quicknode/causes`, its own
   token in `QUICKNODE_CAUSES_SECRET`). The filter watches the causes'
   wallets and reports any USDC that arrives, from the escrow program or
   anyone else. The overlay says "$2 just reached Food Bank, confirmed on
   Solana" with how fast it got there, and the stream page shows the total
   confirmed on chain. The wallet list is fixed in the filter: run the
   command again and update the Stream when a streamer adds a cause.

Both filters are tested by running them on real blocks from a local
validator (`getBlock`), which has the same shape as the Block dataset.

## Backfill

For the time before the Stream ran, or while it was down:

```
pnpm --filter @potted/web quicknode backfill        # newest 500 transactions
pnpm --filter @potted/web quicknode backfill 5000
```

It reads the program's past transactions through `SOLANA_RPC_URL` (use
your QuickNode endpoint), decodes them like a delivery and stores each
event once, so nothing already delivered is duplicated. QuickNode Streams
can also replay from a past block themselves: set the Stream's start block
when you create it.

## Grok on X

When the escrow Stream shows a goal pot crossing half its goal, reaching
it, or a challenge settling, Grok writes a post with the challenge's link
(which opens as a Blink). Each post is checked: the link exactly once, only
figures from the facts, no @mentions, at most one hashtag, within X's
limit. Without a Grok key, or if the draft fails a check, fixed text is
used. Posts appear on `/activity` as drafts; set `POTTED_X_POSTS=auto` with
the X keys (docs/keys.md) to post them from Potted's account. A post with a
link costs about $0.20 on X's pay-per-use API.
