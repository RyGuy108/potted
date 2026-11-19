# The !potted chat bot

In any connected chat:

- `!potted` (or `!pot`): the open challenge, its pot, and the one-tap link to back it, `/j/<handle>`
- `!potted top`: the stream's top planters

It also posts when an attempt starts, when a pot reaches its goal, and the
result, at most one message every 4 seconds per streamer. Streamers turn it
on or off, connect Kick and YouTube, and send a test message on their
Channel page.

| Platform | How it connects |
| --- | --- |
| Twitch | One Potted bot account joins each streamer's linked Twitch channel over Twitch's chat connection. The streamer only fills in their Twitch channel. Mod the bot (`/mod <bot name>`) so its links are never held back. |
| Kick | The streamer connects their Kick account. Kick sends their chat to `/api/webhooks/kick` (signed; checked against Kick's public key) and the bot replies through Kick's chat API. |
| YouTube | The streamer connects with Google (YouTube permission). While they are live on YouTube (Go live with their YouTube link), the server reads the live chat every 8 seconds and replies. |

TikTok LIVE has no official API for reading chat, so there is no TikTok
bot; TikTok streamers use the overlay and its QR code (which also opens
`/j/<handle>`).

Setup keys are in `docs/keys.md`. Everything is tested against stand-ins
for each platform; the exact Kick event name (`chat.message.sent`) and chat
message type (`bot`) should be confirmed on first setup against Kick's
docs.
