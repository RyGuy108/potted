"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startCampaignAction } from "@/app/actions";

/** Starts a campaign: a name and an optional overall target. */
export function CampaignForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <form
      className="campaign-form"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await startCampaignAction(name, goal);
          if (!r.ok) return setError(r.error);
          setError(undefined);
          setName("");
          setGoal("");
          router.refresh();
        });
      }}
    >
      <label className="field">
        <span>Campaign name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Road to 2000 Elo" maxLength={50} required />
      </label>
      <label className="field">
        <span>Target across all its challenges ($, optional)</span>
        <input value={goal} onChange={(e) => setGoal(e.target.value)} inputMode="decimal" placeholder="500" />
      </label>
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Starting…" : "Start campaign"}
      </button>
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
