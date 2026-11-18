"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { signInAction, signUpClimberAction } from "@/app/actions";

const BUTTON = { fan: "Join as a planter", streamer: "Create my stream", mod: "Join as a keeper" } as const;
const NOTE = {
  fan: "Planters back challenges. You start with $25 of test USDC.",
  streamer: "Your stream gets its own page and overlay. Fans pledge test USDC.",
  mod: "Keepers review clips that funders dispute and make the call.",
} as const;

/** A new demo account of one type, with test money and no password. */
export function DemoSignUp({ role, redirectTo }: { role: "fan" | "streamer" | "mod"; /** Stays on the page when omitted. */ redirectTo?: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="demo"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const result = role === "streamer" ? await signUpClimberAction(name, handle) : await signInAction(name, role);
          if (!result.ok) return setError(result.error);
          if (redirectTo) router.push(redirectTo);
          router.refresh();
        });
      }}
    >
      <div className="row">
        <input aria-label="Your name" placeholder="Your name" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
        {role !== "streamer" && (
          <button className="btn btn-primary" disabled={pending}>
            {pending ? "Joining…" : BUTTON[role]}
          </button>
        )}
      </div>
      {role === "streamer" && (
        <div className="row">
          <input aria-label="Stream address" placeholder="Stream address, e.g. yourname" value={handle} maxLength={20} onChange={(e) => setHandle(e.target.value)} />
          <button className="btn btn-primary" disabled={pending}>
            {pending ? "Setting up…" : BUTTON.streamer}
          </button>
        </div>
      )}
      <p className="muted small">{NOTE[role]}</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
