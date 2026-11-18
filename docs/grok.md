# Grok in Potted

Grok does three jobs. All three go through `packages/coordinator`, and every
one falls back to fixed rules when `XAI_API_KEY` is missing or a call fails,
with the reason shown in the UI.

## 1. The scout (climber dashboard)

`scout()` in `packages/coordinator/src/scout.ts` calls the xAI Responses API
(`POST /v1/responses`) with two server-side tools:

- `x_search`, limited to the past week, for trends in the climber's games
- `web_search`, for releases, patches and records

The input is built in `apps/web/src/lib/scout.ts`:

| Input | Where it comes from |
|---|---|
| Games, completion rate, average pot, minutes to reach the goal | the climber's past challenges |
| Recent titles | so pitches do not repeat |
| Waiting fan ideas | planters' suggestions |
| Pledges, pledged USD, settlements, payouts in the last day | escrow events delivered by the QuickNode Stream |
| Largest goal | the climber's own limit |

Grok returns pitches as JSON. `checkPitch()` keeps only what the app can run:
known games, clip statements of the right length, data-checked games only
when the climber's account is already on file (account names never come
from the model), goals clamped to the climber's limit, and source links only
if the search actually returned them.

Each pitch can be opened in one click, edited in the challenge form first,
or posted to X with a prefilled post. With **autopilot** on, the overlay's
poll opens the next pitch whenever nothing is live (at most one every few
minutes), the announcer reads Grok's hook on stream, and the scout looks
again when its pitches are used up or a few hours old.

## 2. Drafting terms from fan ideas

When a climber picks up a fan's idea, `draftTerms()` asks Grok to turn it
into exact terms for that game's checker. The draft only fills the form.

## 3. Briefing keepers

When a clip is disputed, `disputeBrief()` asks Grok what a keeper should
look for in the clip. It never recommends a ruling.

## Settings

```
XAI_API_KEY=...
XAI_MODEL=grok-4.7     # optional
```

## For the Grok bounty

The bounty also asks for a Grok Bot chat export showing how it was built or
used. Export a conversation with Grok on X where you used it for the project
and add it to the submission.
