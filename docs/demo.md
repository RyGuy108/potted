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
2. Fan windows: join with a name, add to the pot. The beanstalk on the overlay climbs.
3. Dashboard: **Start attempt**. Pledging closes.
4. Play one rated bullet game from Lichess quick pairing.
5. The overlay announces the result. The challenge page shows the receipt
   with a link to the game. A win pays you; a loss refunds every fan.
6. Repeat with a GTA VI challenge: start, post a clip link, and let the
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

## The demo seed on the live server

The hosted server (Railway production) loads a demo seed on start-up so
browse, stream pages and leaderboards have something in them. It is the
sample in `apps/web/src/lib/sample-data.ts` and `sample-live.ts`: about
thirty accounts (seven climbers, twenty-six planters, three keepers), six
weeks of past challenges, and a set of live pots that stay open for a day.
When a set closes (and is refunded), a fresh set opens within five minutes.

How to tell it apart: every seeded record's id contains `_s_`, every past
settlement shows a "sample history" tag on its receipt, and the seeded
history never claims to be on-chain.

| Variable | Effect |
| --- | --- |
| `POTTED_DEMO_SEED=on` | Load it once; reopen live pots daily. Default on Railway production. |
| `POTTED_DEMO_SEED=remove` | Take every seeded record back out on the next start. Real accounts are untouched. |
| `POTTED_DEMO_SEED=off` | Leave things as they are. Default everywhere else. |
| `POTTED_DEMO_CODE` | The sign-in code for the demo logins below. Unset, they cannot sign in. |

### Demo logins

Sign in with email on `/login` and enter the server's `POTTED_DEMO_CODE`
as the code. No mail is sent; `.potted` is not a real domain.

| Email | Account | What's in it |
| --- | --- | --- |
| `planter@demo.potted` | Maya, planter | Six weeks of pledges, badges, XP, points, follows; backing live pots |
| `climber@demo.potted` | Moss, chess climber | A live blitz pot, past receipts, a fan idea waiting, channel points |
| `keeper@demo.potted` | Hazel, keeper | Past rulings and Juniper's disputed Ender Dragon clip to rule on |

## Making each sponsor visible

Each technology is labelled where it acts, with a small coloured tag:

| Tech | Where it shows |
| --- | --- |
| Grok | "Drafted by Grok" on the challenge form when a fan idea or scout pitch is used; "Terms drafted by Grok" on the opened challenge's page; "Grok scout" panel on the dashboard; "Written by Grok" on overlay lines; "Checklist by Grok" for keepers on a disputed clip; Grok posts on `/activity`. Needs `XAI_API_KEY`. |
| QuickNode Streams | "⚡ 1.2s from confirmation · via QuickNode Streams" on overlay pledge alerts; "via QuickNode" next to each pledge the Stream delivered on the challenge page; "Seen on chain by QuickNode Streams" on receipts; the whole `/activity` page. Needs the Solana ledger and `QUICKNODE_WEBHOOK_SECRET`. |
| ElevenLabs | "Voiced by ElevenLabs" under every overlay line it speaks, milestone sound effects, the voice picker in Settings. Needs `ELEVENLABS_API_KEY`; click once on the overlay tab so the browser lets it play audio. |
| Solana | "Escrow on Solana" on every challenge page (links to the create transaction), a transaction link next to each pledge, "Settled by the escrow program on Solana" plus the Explorer link on receipts, badges in the wallet. Needs `POTTED_LEDGER=solana`; on the simulated ledger these links are hidden and the yellow banner shows. |
| All four | The "Built on" section on the home page says what each one does. |
