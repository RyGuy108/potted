import { demoAccountsOn } from "./demo-mode";
import type { Ledger } from "./ledger";
import { type Role, type User, db, save } from "./store";

/**
 * Clean accounts for trying things by hand: two of each kind, no history.
 * They are created the first time the app starts and kept from then on;
 * loading or removing the demo sample does not touch them. Turn them off
 * with POTTED_TEST_ACCOUNTS=off; they are also off whenever demo accounts
 * are (see demo-mode.ts), as on the live server.
 */
export const TEST_ACCOUNTS: { id: string; name: string; role: Role; handle?: string; note: string }[] = [
  { id: "u_t_planter1", name: "Tester One", role: "fan", note: "Test planter, $50 test USDC" },
  { id: "u_t_planter2", name: "Tester Two", role: "fan", note: "Test planter, $50 test USDC" },
  { id: "u_t_climber1", name: "Test Climber", role: "streamer", handle: "testclimber", note: "Test climber, no history" },
  { id: "u_t_climber2", name: "Test Climber Two", role: "streamer", handle: "testclimber2", note: "Test climber, for collabs" },
  { id: "u_t_keeper1", name: "Keeper Test", role: "mod", note: "Test keeper" },
  { id: "u_t_keeper2", name: "Keeper Test Two", role: "mod", note: "Test keeper" },
];

const START_USD = 50;
let checked = false;

/** Adds any test account that is missing. Runs once per process. */
export function ensureTestAccounts(ledger: Ledger): void {
  if (checked || process.env.POTTED_TEST_ACCOUNTS === "off" || !demoAccountsOn()) return;
  checked = true;
  const state = db();
  let added = false;
  for (const spec of TEST_ACCOUNTS) {
    if (state.users.some((u) => u.id === spec.id)) continue;
    const handleFree = !spec.handle || !state.users.some((u) => u.handle === spec.handle);
    const user: User = {
      id: spec.id,
      name: spec.name,
      role: spec.role,
      ...(spec.handle && handleFree ? { handle: spec.handle } : {}),
      wallet: ledger.newWallet(spec.id),
      createdAt: Date.now(),
    };
    if (spec.role === "streamer" && !user.handle) continue;
    state.users.push(user);
    added = true;
    if (spec.role === "fan") {
      void ledger.faucet(user.wallet, START_USD * 1_000_000).catch((err) => console.error(`Could not fund ${spec.name}:`, err));
    }
  }
  if (added) save();
}

export const isTestAccount = (id: string) => TEST_ACCOUNTS.some((t) => t.id === id);
