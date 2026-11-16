"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { pledgeAction } from "@/app/actions";

const QUICK = [1, 2, 5];

export function PledgeForm({ challengeId, remainingUsd }: { challengeId: string; remainingUsd: number }) {
  const router = useRouter();
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function pledge(amount: number) {
    setMessage(null);
    start(async () => {
      const result = await pledgeAction(challengeId, amount);
      setMessage(result.ok ? { ok: true, text: `You added $${amount}. It comes back if the challenge fails.` } : { ok: false, text: result.error });
      if (result.ok) setCustom("");
      router.refresh();
    });
  }

  return (
    <div className="pledge">
      <div className="row">
        {QUICK.filter((a) => a <= remainingUsd).map((amount) => (
          <button key={amount} type="button" className="btn btn-primary" disabled={pending} onClick={() => pledge(amount)}>
            Add ${amount}
          </button>
        ))}
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            const amount = Number(custom);
            if (amount > 0) pledge(amount);
          }}
        >
          <input
            aria-label="Custom amount in dollars"
            inputMode="decimal"
            placeholder="Other $"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className="narrow"
          />
          <button className="btn btn-ghost" disabled={pending || !(Number(custom) > 0)}>
            Add
          </button>
        </form>
      </div>
      {message && (
        <p className={message.ok ? "success" : "error"} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}
