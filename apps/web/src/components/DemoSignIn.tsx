"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { signInAction, useDemoGuestAction, useDemoStreamerAction } from "@/app/actions";

/** Walk through Potted with test money and ready-made accounts. */
export function DemoSignIn({ redirectTo }: { redirectTo?: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function go(work: () => ReturnType<typeof signInAction>, then?: string) {
    setError(null);
    start(async () => {
      const result = await work();
      if (!result.ok) return setError(result.error);
      if (then) router.push(then);
      router.refresh();
    });
  }

  return (
    <div className="demo">
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          go(() => signInAction(name, "fan"), redirectTo);
        }}
      >
        <input aria-label="Your name" placeholder="Your name" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Joining…" : "Join as a planter"}
        </button>
      </form>
      <p className="muted small">Planters back challenges. You start with $25 of test USDC.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="demo-roles">
        <div className="card demo-role">
          <strong>Climber</strong>
          <span className="muted small">Run challenges from a demo stream. Two are set up so you can try a collab between them.</span>
          <span className="row">
            <button type="button" className="btn btn-ghost" onClick={() => go(useDemoStreamerAction, "/dashboard")}>
              Ryan
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => go(useDemoGuestAction, "/dashboard")}>
              Kai
            </button>
          </span>
        </div>
        <div className="card demo-role">
          <strong>Keeper</strong>
          <span className="muted small">Review disputed clips and make the call.</span>
          <span className="row">
            <button type="button" className="btn btn-ghost" onClick={() => go(() => signInAction(name || "Keeper", "mod"), redirectTo)}>
              Enter as a keeper
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
