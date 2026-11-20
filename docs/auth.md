# Sign-in

Visitors sign in with an account they already have (Google, Twitch or
Discord) or walk through the demo with test money. A provider's button is
switched on by setting its two keys; without them it shows as "not
connected".

## Turning a provider on

Each provider needs an OAuth app with this redirect address, where
`<base>` is the site's address (`http://localhost:3000` in development):

```
<base>/api/auth/<provider>/callback
```

| Provider | Where to create the app | Keys in `apps/web/.env.local` |
| --- | --- | --- |
| Google | Google Cloud console → APIs & Services → Credentials → OAuth client ID (Web application) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Twitch | dev.twitch.tv → Your Console → Register Your Application | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` |
| Discord | discord.com/developers → New Application → OAuth2 | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` |

When hosting, also set `POTTED_PUBLIC_URL` to the site's address and
`SESSION_SECRET` to a long random string.

## What happens on sign-in

1. The browser goes to the provider with a one-time `state` value, also
   kept in a short-lived cookie.
2. The provider sends it back with a code. The callback only continues if
   the `state` matches the cookie.
3. The server swaps the code for the person's profile (id, name, email),
   then discards the provider's token. No password is ever seen.
4. A new email, Google or Twitch sign-in reuses an existing account when it has a single verified mailbox match. Gmail and Google Workspace must report a verified email. Google accounts with a third-party mailbox can sign in with an emailed code first, then connect Google from Settings. Legacy accounts with uncertain or duplicate email matches require the original sign-in method. Verify email in Settings to add it to that account. Existing duplicate accounts are never merged automatically.
5. A first-time visitor chooses planter or climber on `/welcome`. Climbers
   pick the address of their stream.

Sessions are a cookie holding the user id and an HMAC signature, so a
cookie edited to another id is rejected.

## Roles

| In the data | On screen | What they do |
| --- | --- | --- |
| `fan` | Planter | Backs challenges |
| `streamer` | Climber | Runs challenges; any two climbers can collab |
| `mod` | Keeper | Rules on disputed clips |

## Not yet verified

The provider flow is tested against faked providers. It has not been run
against real Google, Twitch or Discord apps, which needs the keys above.
Wallets are still simulated: a signed-in account gets test USDC, not an
on-chain wallet. That arrives with the Solana ledger.
