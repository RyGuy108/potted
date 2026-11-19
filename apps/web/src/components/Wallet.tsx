import { formatUsd } from "@potted/core";
import { ledger } from "@/lib/ledger";
import { balanceOf } from "@/lib/service";
import type { User } from "@/lib/store";

/** The account's balance, shown on the pages where money is the subject, not in the header. */
export async function Wallet({ user }: { user: User }) {
  const balance = await balanceOf(user);
  return (
    <span className="wallet" title={ledger().kind === "sim" ? "Test USDC on the simulated ledger" : "USDC"}>
      <span className="muted small">{ledger().kind === "sim" ? "Test balance" : "Balance"}</span>
      <span className="mono balance">{formatUsd(balance)}</span>
    </span>
  );
}
