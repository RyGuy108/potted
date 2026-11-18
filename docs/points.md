# Channel points and Twitch on stream pages

## Channel points

Planters earn a climber's points by putting money into that climber's pots,
and spend them on rewards the climber defines. They work like Twitch
channel points, but they are earned with real support rather than watch
time.

- **Rate:** points per $1 pledged, set by each climber (default 100).
- **When they land:** on pledging (a refund takes them back), or only when
  the challenge is completed.
- **Rewards:** up to 12, each with a cost, a description, an on/off switch,
  and optionally a line of text from the planter (a game to pick, a name to
  shout out). New climbers start with four editable starter rewards.
- **Redeeming:** the planter's points are checked, the redemption goes into
  the climber's queue on the dashboard, and the overlay announces it. The
  climber marks it **Done** or **Refund points**.
- **Balances** are never stored: they are worked out from pledges minus
  redemptions that were not refunded, so they cannot drift.

Planters redeem on the stream page, in the extension's side panel, and see
their balances with every climber in their garden. Climbers set everything
up under **Channel points** on the dashboard.

Code: `apps/web/src/lib/points.ts`.

## Twitch profile picture and live preview

When a climber enters their Twitch channel in stream settings, their stream
page shows their Twitch profile picture and a preview of the stream: a live
frame with the title, game and viewer count, or the offline banner. Clicking
it opens the channel on Twitch.

It uses the Twitch API with an app access token from `TWITCH_CLIENT_ID` and
`TWITCH_CLIENT_SECRET` (the same app as Twitch sign-in), so climbers do not
authorize anything. Answers are cached for a minute. Without the keys, or
when Twitch does not answer, the page shows the climber's initials and no
preview.

Code: `apps/web/src/lib/twitch.ts`.
