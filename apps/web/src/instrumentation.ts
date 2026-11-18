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
}
