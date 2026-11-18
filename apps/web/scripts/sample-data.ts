/**
 * Loads the demo sample: about six weeks of past challenges plus a handful
 * that are live right now. Stop the dev server first; it keeps the data in
 * memory and would write over the sample.
 *
 *   pnpm --filter @potted/web sample            history + live challenges
 *   pnpm --filter @potted/web sample --hours 6  live challenges stay open 6 hours (default 24)
 *   pnpm --filter @potted/web sample --history  history only, no transactions
 *   pnpm --filter @potted/web sample --live     reopen only the live challenges (fresh timers), keep the history
 *   pnpm --filter @potted/web sample --remove   take the sample back out
 */
import { addSampleHistory, removeSample } from "../src/lib/sample-data";
import { addSampleLive, removeSampleLive } from "../src/lib/sample-live";
import { ledger } from "../src/lib/ledger";
import { db, flush, hydrate, save } from "../src/lib/store";

const args = process.argv.slice(2);
const hoursAt = args.indexOf("--hours");
const hours = hoursAt >= 0 ? Number(args[hoursAt + 1]) : 24;

async function main() {
  // With Supabase set up, work on what the app will load, and write it back at the end.
  await hydrate();
  const state = db();
  if (args.includes("--remove")) {
    removeSample(state);
    save();
    console.log("Sample removed.");
    return;
  }
  if (!(hours > 0 && hours <= 24)) throw new Error("--hours must be between 1 and 24");

  if (args.includes("--live")) {
    if (!state.sample) throw new Error("Load the sample first: pnpm --filter @potted/web sample");
    ledger();
    console.log(`Closed ${removeSampleLive()} old live challenges. Opening fresh ones...`);
    await addSampleLive({ minutes: Math.round(hours * 60), log: (line) => console.log(`  ${line}`) });
    console.log("Done. Start the app again with: pnpm --filter @potted/web dev");
    return;
  }

  // Makes the test accounts if this data folder doesn't have them yet, so they get a history too.
  ledger();
  const history = addSampleHistory(state);
  save();
  console.log(
    `History: ${history.users.length} accounts, ${history.challenges.length} past challenges, ${history.pledges.length} pledges, ${history.suggestions.length} ideas.`,
  );
  if (args.includes("--history")) return;

  const mode = process.env.POTTED_LEDGER ?? "sim";
  console.log(`Opening live challenges on the ${mode} ledger${mode === "solana" ? " (real devnet transactions, takes a minute or two)" : ""}...`);
  await addSampleLive({ minutes: Math.round(hours * 60), log: (line) => console.log(`  ${line}`) });
  console.log("Done. Start the app again with: pnpm --filter @potted/web dev");
}

main()
  .then(() => flush())
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
