# Potted browser extension

A side panel that sits beside a stream. Planters fund the challenges of
the channel they are watching; climbers open and run challenges without
leaving their stream. It is a thin client: every action is a call to the
Potted server's `/api/ext` endpoints, which enforce all the rules.

## Load it in Chrome

1. Start the Potted server (`pnpm --filter @potted/web dev`).
2. Open `chrome://extensions`, turn on **Developer mode**, click
   **Load unpacked** and choose this folder (`apps/extension`).
3. Pin Potted from the puzzle-piece menu and click its icon. The panel
   opens on the right.

There is no build step. After changing a file, click the reload arrow on
the extension's card in `chrome://extensions`.

## Connecting an account

- **Log in / Sign up** opens the site's connect page. Once you are signed
  in there, the extension picks up a token from that tab and closes it.
- **Paste a connection code** does the same by hand, with the code the
  connect page shows.
- **Demo** accounts work with no sign-in: a planter with test money, or
  the two demo climbers.

The token lasts 30 days and is kept in the extension's own storage.
**Disconnect** deletes it.

## Which stream is "this tab"

| Tab address | Matched to |
| --- | --- |
| `twitch.tv/<channel>` | The climber who entered that Twitch channel in their stream settings |
| `youtube.com/@<handle>` | The climber who entered that YouTube handle |
| `<server>/s/<handle>` | That Potted stream |

A YouTube watch page (`youtube.com/watch?v=…`) does not name the channel
in its address, so it is not matched; the panel lists live streams there.

## Pointing it at a hosted server

Open the panel while disconnected, expand **Server**, and enter the
site's address. The default is `http://localhost:3000`.

## Permissions

| Permission | Why |
| --- | --- |
| `sidePanel` | To show the panel |
| `storage` | To keep the server address and the account token |
| `tabs` | To read the current tab's address, for matching the stream and picking up the token from the connect page |

## Files

| File | What it is |
| --- | --- |
| `manifest.json` | Extension manifest (Manifest V3) |
| `background.js` | Opens the panel from the toolbar icon; stores the token from the connect page |
| `shared.js` | Settings, and reading a stream or token out of a tab address |
| `panel.html`, `panel.css`, `panel.js` | The panel |
