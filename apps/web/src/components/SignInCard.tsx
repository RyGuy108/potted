"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { signInAction, useDemoStreamerAction } from "@/app/actions";

/** Judge-mode sign-in: pick a name and get test USDC, no wallet needed. */
export function SignInCard({ compact = false }: { compact?: boolean }) {
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
    <div className="card signin">
      {!compact && <h3>Try it in one click</h3>}
      <p className="muted">Pick a name. You get $25 of test USDC to pledge with. No wallet or seed phrase.</p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          go(() => signInAction(name, "fan"));
        }}
      >
        <input
          aria-label="Your name"
          placeholder="Your name"
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Joining…" : "Join as a fan"}
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="signin-alt muted">
        Or demo another role:{" "}
        <button type="button" className="link" onClick={() => go(useDemoStreamerAction, "/dashboard")}>
          streamer
        </button>
        {" · "}
        <button type="button" className="link" onClick={() => go(() => signInAction(name || "Moderator", "mod"))}>
          moderator
        </button>
      </p>
    </div>
  );
}
