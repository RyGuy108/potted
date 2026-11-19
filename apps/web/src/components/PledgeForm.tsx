"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { pledgeAction } from "@/app/actions";
import { ShareButtons } from "./ShareButtons";

const QUICK = [1, 2, 5];

export function PledgeForm({ challengeId, remainingUsd, upfrontPct = 0 }: { challengeId: string; remainingUsd: number; upfrontPct?: number }) {
  const router = useRouter();
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [shared, setShared] = useState<{ pledgeId: string; amount: number } | null>(null);
  const [pending, start] = useTransition();

  function pledge(amount: number) {
    setMessage(null);
    start(async () => {
      const result = await pledgeAction(challengeId, amount);
      setMessage(result.ok ? { ok: true, text: upfrontPct > 0
              ? `You added $${amount}. If the challenge is missed, the ${100 - upfrontPct}% not paid up front comes back.`
              : `You added $${amount}. It comes back if the challenge fails.` } : { ok: false, text: result.error });
      if (result.ok) setCustom("");
      setShared(result.ok && result.pledgeId ? { pledgeId: result.pledgeId, amount } : null);
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
      {shared && (
        <div className="pledge-share">
          <p className="muted small">
            Bring a friend: your card shows your ${shared.amount} and updates with the result. <a href={`/c/${challengeId}/planted/${shared.pledgeId}`}>Preview it</a>
          </p>
          <ShareButtons
            path={`/c/${challengeId}/planted/${shared.pledgeId}`}
            text={`I planted $${shared.amount} on this challenge. It only pays if they pull it off. Back it with me:`}
            card={`/api/cards/pledge/${shared.pledgeId}`}
            cardName={`potted-${shared.pledgeId}.png`}
          />
        </div>
      )}
    </div>
  );
}
