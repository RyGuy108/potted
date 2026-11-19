/**
 * Which features are switched on, from apps/web/.env.local. Prints only
 * whether each variable is set, never its value.
 *
 *   pnpm --filter @potted/web keys
 */
const FEATURES: [string, string[], string?][] = [
  ["Hosting: public address and session key", ["POTTED_PUBLIC_URL", "SESSION_SECRET"]],
  ["Solana ledger (instead of simulated)", ["POTTED_LEDGER", "SOLANA_RPC_URL", "POTTED_PROGRAM_ID", "VERIFIER_SECRET_KEY", "USDC_MINT"]],
  ["QuickNode escrow Stream", ["QUICKNODE_WEBHOOK_SECRET"]],
  ["QuickNode charity Stream", ["QUICKNODE_CAUSES_SECRET"]],
  ["Grok (scout, terms, recaps, X posts, translation)", ["XAI_API_KEY"]],
  ["Grok posts go out on X", ["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_SECRET", "POTTED_X_POSTS"], "POTTED_X_POSTS must be auto"],
  ["ElevenLabs voices, sounds, cloning", ["ELEVENLABS_API_KEY"]],
  ["Google sign-in (and YouTube chat bot)", ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]],
  ["Twitch sign-in and live status", ["TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET"]],
  ["Twitch chat bot", ["TWITCH_BOT_USERNAME", "TWITCH_BOT_TOKEN"]],
  ["Kick chat bot", ["KICK_CLIENT_ID", "KICK_CLIENT_SECRET"]],
  ["Email sign-in codes", ["RESEND_API_KEY", "EMAIL_FROM"]],
  ["Privy wallets", ["PRIVY_APP_ID", "PRIVY_APP_SECRET"]],
  ["Supabase storage", ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]],
];

let missing = 0;
for (const [feature, vars, note] of FEATURES) {
  const unset = vars.filter((v) => !process.env[v]);
  const ok = unset.length === 0 && !(note && process.env.POTTED_X_POSTS !== "auto");
  if (!ok) missing++;
  console.log(`${ok ? "✓" : "✗"} ${feature}${ok ? "" : `: missing ${unset.join(", ") || note}`}`);
}
console.log(missing ? `\n${missing} feature(s) off. How to get each key: docs/keys.md` : "\nEverything is on.");
