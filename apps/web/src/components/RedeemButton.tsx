"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { redeemAction } from "@/app/actions";

export function RedeemButton({ handle, rewardId, title, needsInput, short }: { handle: string; rewardId: string; title: string; needsInput: boolean; /** Points still needed; 0 when affordable. */ short: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (short > 0) return <span className="muted small">{short.toLocaleString()} more points</span>;
  const go = () =>
    start(async () => {
      setMessage(null);
      const result = await redeemAction(handle, rewardId, text);
      if (!result.ok) return setMessage({ ok: false, text: result.error });
      setMessage({ ok: true, text: `Redeemed. ${title} is in the streamer's queue.` });
      setOpen(false);
      setText("");
      router.refresh();
    });
  return (
    <div className="redeem">
      {needsInput && open ? (
        <div className="row">
          <input aria-label={`Your note for ${title}`} placeholder="Your pick or message" maxLength={140} value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn btn-primary" disabled={pending} onClick={go}>
            {pending ? "Redeeming…" : "Send"}
          </button>
        </div>
      ) : (
        <button className="btn btn-primary" disabled={pending} onClick={() => (needsInput ? setOpen(true) : go())}>
          {pending ? "Redeeming…" : "Redeem"}
        </button>
      )}
      {message && (
        <span className={message.ok ? "success small" : "error small"} role={message.ok ? "status" : "alert"}>
          {message.text}
        </span>
      )}
    </div>
  );
}
