# Running and recording a demo

## Run it

```bash
pnpm install
cp .env.example apps/web/.env.local
pnpm dev                      # http://localhost:3000
```

Nothing else is needed for chess: Lichess has no key. Brawl Stars and
Fortnite need the keys named in `.env.example`.

## Three windows

| Window | URL | Who |
| --- | --- | --- |
| Dashboard | `/dashboard`, then "streamer" | You, creating and running challenges |
| Fan page | `/s/ryan` in a private window or on a phone | A fan with $25 of test USDC |
| Overlay | `/overlay/ryan` as an OBS browser source | What viewers see on stream |

Open `/overlay/ryan?bg=1` in a normal tab to preview the overlay on a dark
background. Each private window is a separate fan.

## A two-minute run

1. Dashboard: create "win your next rated bullet game" with your Lichess name.
2. Fan windows: join with a name, add to the pot. The plant on the overlay grows.
3. Dashboard: **Start attempt**. Pledging closes.
4. Play one rated bullet game from Lichess quick pairing.
5. The overlay announces the result. The challenge page shows the receipt
   with a link to the game. A win pays you; a loss refunds every fan.
6. Repeat with a GTA IV challenge: start, post a clip link, and let the
   dispute window run out. Use a second fan to show a dispute.

## Rehearsing without playing

Set `POTTED_ALLOW_SIMULATED_RESULTS=true` to get "Rehearse a win" and
"Rehearse a miss" buttons on the dashboard. Receipts from them are marked
as rehearsal results on the page. Turn the flag off when recording anything
you present as a real result.

## What the banner means

With `POTTED_LEDGER=sim` (the default) balances are numbers in a local file,
not tokens. The yellow banner says so on every page. It goes away once the
app is pointed at the deployed escrow program.
