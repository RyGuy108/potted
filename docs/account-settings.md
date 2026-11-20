# Account profiles and settings

`/settings` is available to signed-in planters, climbers and keepers. `/me` links to it. It uses the existing session, user record and single-server file/Supabase persistence; no migration or additional credentials are required.

## Profile behavior

- Display name (24 characters), bio (500), interests (160), HTTPS website, time zone and photo.
- JPG, PNG and WebP uploads up to 2 MB are decoded with a 20-megapixel limit, cropped to 256×256, re-encoded to JPEG without original metadata, and stored with the user. No arbitrary server-side URL fetch or active SVG uploads.
- Streamer profiles appear on `/s/<handle>`. Optional planter/keeper profiles appear on `/u/<id>`, initially private. Publishing does not reveal email, wallet or provider credentials. Existing public challenge activity is unaffected.
- Manual edits override future imports. The per-field import checkboxes deliberately restore provider-managed fields at the next refresh or sign-in. Connecting another provider changes the selected import source without overwriting custom fields.
- Community and award notification preferences are enforced at notice creation. Financial, refund, reward and proof-review notices remain enabled. Existing notices are retained.
- Broadcasts may be added/removed manually (20 per list), separately from imported Twitch rows. Display toggles hide each list on the public page. Dates entered by the browser use the device time zone; saved dates use UTC and display in the profile's chosen time zone.

## Connections

Twitch is the first complete profile/schedule/history source. OAuth establishes the stable Twitch user ID. Existing Twitch application credentials then read public users, schedule and archive-video APIs; public channel text never proves account ownership. Refresh happens on Twitch sign-in, connection and the explicit Refresh Twitch action. This is a timestamped snapshot, not continuous background synchronization. The first 10 upcoming schedule entries and 10 available archived broadcasts are imported. A missing schedule is empty; partial API failures keep previous data and show warnings.

Google and Discord import names and available photos on sign-in or linking. Google sign-in does not authorize a YouTube channel. Kick and YouTube channel/chat connections remain on Channel settings; this change does not add their schedule/history import.

Linking is bound to the signed-in session and the random OAuth state. A provider identity already owned by another account cannot be linked. Users cannot disconnect their last sign-in identity. Disconnecting removes the identity from Potted and imported data for that source; it does not revoke an existing Potted browser session. Sign-in provider tokens are used once and discarded. Users can revoke app authorization in the provider's own settings.

## Configuration

Existing `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET`, `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, and `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` enable their respective cards. Keep the existing `/api/auth/<provider>/callback` redirects. New settings pages require no new callback URLs or scopes. No credentials were copied into this development checkout.

The Server Action body limit is 3 MB to allow a 2 MB image plus multipart overhead. Production still requires the existing persistent data folder and one replica.

## Integration audit against the supplied plans

| Area | Existing main and this change | Still requires separate work |
| --- | --- | --- |
| Twitch | Sign-in, public channel/live lookup, chat bot; this change adds authenticated profile linking and schedule/archive snapshots | Real-account acceptance, native reward EventSub inbox, broader connection health and continuous lifecycle reconciliation |
| Kick | Existing PKCE, encrypted per-streamer tokens, signature checks, persisted outbox, refresh, cooldowns, repair and disconnect; existing mocked tests pass | Live acceptance checklist in `docs/kick.md`; native reward proposals and profile/schedule import |
| YouTube | Existing separate channel consent and live-chat polling | Real-account acceptance; protected token storage, persisted streaming consumption, profile/broadcast import and richer connection diagnostics |
| Discord | Sign-in and now optional profile-photo import | Guild installation, structured challenge commands and announcements |

Native platform activity does not credit the ledger or settle challenges. Escrow, verifier logic and payment limits are unchanged.

## Verification and live acceptance

Automated tests cover account ownership, field validation, manual overrides, partial Twitch failures, missing schedules, canceled segments, notification enforcement, disconnect lockout and upload sanitization. Browser checks cover both roles, uploads, persistence, public visibility, schedule rendering and a 390px mobile layout.

Before release, with a real authorized Twitch account:

1. Set the existing credentials and exact callback origin; sign in to Potted and connect Twitch from Settings.
2. Confirm the account remains the same and the correct photo, bio and Twitch channel appear.
3. Compare schedule and archive rows with Twitch. Empty schedules and unavailable VODs are legitimate; do not promise a complete lifetime history.
4. Customize the bio and upload a photo, then refresh. Confirm those overrides remain. Re-enable individual import fields, save and refresh to restore provider data.
5. Test another account trying to link the same Twitch identity; it must fail. Test changing Potted users between starting consent and the callback; it must fail.
6. Connect a second sign-in method, disconnect Twitch, and verify imported data is removed while custom edits remain.
7. Execute Kick's separate live acceptance checklist only with the account owner's deliberate public-chat test action.

Live provider OAuth, chat delivery and Solana integration have not been verified in this development environment.

## Official references

- https://dev.twitch.tv/docs/api/reference/users
- https://dev.twitch.tv/docs/api/reference/schedule
- https://dev.twitch.tv/docs/api/reference/videos
- https://developers.google.com/youtube/v3/docs/channels
- https://developers.google.com/youtube/v3/live/docs/liveBroadcasts
- https://docs.kick.com/apis/channels
