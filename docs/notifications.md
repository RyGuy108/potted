# Notifications and motion

## Notifications

The bell in the header shows a red dot when something is unread. Opening it
lists the latest 25 and marks them read; something new that arrives while a
page is open (or in the half minute before it loaded) also slides in as a
toast. The bell checks every 20 seconds while the tab is visible.

| Who | Hears about |
|---|---|
| Planters | A followed climber opening a challenge or going live on Twitch; challenges they backed reaching the goal, starting, posting a clip, completing (with their share), missing or being cancelled (with what came back); rewards fulfilled or refunded; new badges and level-ups |
| Climbers | New followers, pledges, pot milestones, up-front payouts, disputes on their clips, completions and misses, ideas, collab invites and answers, channel point redemptions, milestones (first completion, $50/$250/$1,000 earned, 10/25 planters, $25 raised for a cause) |
| Keepers | Every clip waiting for a ruling |

Awards are announced once. The first check for someone only records what
they already have, so older accounts and the demo sample are not flooded.

Planters follow a climber from the climber's stream page. "Went live" uses
the Twitch API (see `docs/points.md`), checked while a follower has the
site open; each Twitch session is announced once.

Code: `apps/web/src/lib/notifications.ts`, `components/NotificationBell.tsx`.

## Motion

`components/Motion.tsx` has three pieces, used across the stream, challenge,
garden, analytics, keeper and dashboard pages:

- `CountUp`: numbers and money run up to their value when they scroll into
  view, and from the old value to the new one when it changes.
- `Ring`: a circular gauge that fills to its value (goal progress on a
  challenge, level progress in the garden, completion rate in analytics).
- `GrowBar`: progress bars that grow from empty.

Pages fade and rise in block by block, list items and badges stagger, chart
columns grow from the floor, and the notification panel and toasts scale in
from the bell. Everything uses one easing curve and is turned off for
people who set "reduce motion" on their device.
