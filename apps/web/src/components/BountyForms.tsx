"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { backBountyAction } from "@/app/actions";

/** Add money to someone else's bounty. */
export function BackBountyButtons({ bountyId, minUsd }: { bountyId: string; minUsd: number }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const amounts = [1, 5, 10].filter((a) => a >= minUsd);
  return (
    <div className="row">
      {amounts.map((amount) => (
        <button
          key={amount}
          type="button"
          className="btn btn-ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await backBountyAction(bountyId, amount);
              setMessage(result.ok ? { ok: true, text: `You added $${amount}. It pays when they start, and comes back if they pass.` } : { ok: false, text: result.error });
              router.refresh();
            })
          }
        >
          Add ${amount}
        </button>
      ))}
      {message && (
        <span className={message.ok ? "success" : "error"} role="status">
          {message.text}
        </span>
      )}
    </div>
  );
}
