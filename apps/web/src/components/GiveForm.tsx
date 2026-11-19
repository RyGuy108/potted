"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { giveAction } from "@/app/actions";

const QUICK = [1, 5, 10, 25];

/** Just give: money straight to the climber, no challenge attached. */
export function GiveForm({ handle, name, minUsd }: { handle: string; name: string; minUsd: number }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const send = (usd: number) =>
    start(async () => {
      setMessage(null);
      const result = await giveAction(handle, usd, note);
      if (!result.ok) return setMessage({ ok: false, text: result.error });
      setMessage({ ok: true, text: `You gave ${name} $${usd}. Thank you!` });
      setAmount("");
      setNote("");
      router.refresh();
    });
  return (
    <div className="give">
      <input aria-label="Message with your gift" placeholder={`Say something to ${name} (optional)`} maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="row wrap">
        {QUICK.filter((q) => q >= minUsd).map((q) => (
          <button key={q} type="button" className="btn btn-primary" disabled={pending} onClick={() => send(q)}>
            Give ${q}
          </button>
        ))}
        <input className="give-other" aria-label="Other gift amount" inputMode="decimal" placeholder="Other $" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button type="button" className="btn btn-ghost" disabled={pending || !(Number(amount) > 0)} onClick={() => send(Number(amount))}>
          Give
        </button>
      </div>
      {message && (
        <span className={message.ok ? "success" : "error"} role={message.ok ? "status" : "alert"}>
          {message.text}
        </span>
      )}
    </div>
  );
}
