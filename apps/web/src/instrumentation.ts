/**
 * Runs once when the server starts, before any request. With Supabase set
 * up, the app's state is loaded from it here.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { hydrate } = await import("./lib/store");
  try {
    const from = await hydrate();
    if (from !== "file") console.log(from === "supabase" ? "[supabase] state loaded" : "[supabase] first run: pushed the local data");
  } catch (err) {
    // Serving from the local file beats not serving at all; say so loudly.
    console.error("[supabase] could not load state, using the local file:", err instanceof Error ? err.message : err);
  }
  // One-time clean slates on the live server (backed up first).
  const { onRailwayProduction } = await import("./lib/demo-mode");
  if (onRailwayProduction() || process.env.POTTED_PURGE === "force") {
    const { runPurges } = await import("./lib/purge");
    try {
      for (const r of runPurges()) {
        console.log(`[purge] ${r.id}: removed ${r.removedUsers.length} accounts, ${r.removedChallenges} challenges, ${r.removedPledges} pledges; backup at ${r.backup}`);
        for (const u of r.removedUsers) console.log(`[purge]   ${u.id} ${u.name}${u.providers.length ? ` (${u.providers.join(", ")})` : ""}`);
      }
    } catch (err) {
      console.error("[purge] failed, nothing removed:", err instanceof Error ? err.message : err);
    }
  }
  // One server per data folder: claim it, and back it up hourly.
  const { startOps } = await import("./lib/ops");
  startOps();
  // The background job: deadlines, result checks, request expiry.
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
  // The !potted chat bot: Twitch's chat connection and the YouTube readers.
  const { startChatBots } = await import("./lib/chat-bot");
  startChatBots();
}
