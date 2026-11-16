# Clips and images for the games strip

Drop a file here named after a game's id and the home page uses it in that
game's tile, in place of the built-in illustration:

    chess.mp4   fortnite.webm   gta6.jpg   cooking.png

Ids are the `id` values in `packages/core/src/conditions.ts` (chess,
brawlstars, fortnite, steam, gta6, speedrun, minecraft, fitness, cooking,
music, art, study, other). Video is tried first (mp4, webm), then images
(webp, jpg, jpeg, png). Videos play muted on a loop.

Use footage you have the right to show: your own stream clips are ideal.
Keep videos short (5 to 10 seconds, under 2 MB) so the page stays fast.
