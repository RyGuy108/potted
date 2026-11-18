"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setAutopilotAction } from "@/app/actions";

/** Turns the scout's autopilot on or off, with the largest goal it may open. */
export function AutopilotControl({ on, maxGoalUsd }: { on: boolean; maxGoalUsd: number }) {
  const router = useRouter();
  const [checked, setChecked] = useState(on);
  const [max, setMax] = useState(String(maxGoalUsd));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (next: boolean) => {
    setChecked(next);
    start(async () => {
      setError(null);
      const result = await setAutopilotAction(next, Number(max));
      if (!result.ok) {
        setError(result.error);
        setChecked(on);
      }
      router.refresh();
    });
  };
  return (
    <div className="autopilot">
      <label className="check">
        <input type="checkbox" checked={checked} disabled={pending} onChange={(e) => save(e.target.checked)} />
        Autopilot: when nothing is live, open the scout&apos;s next pitch and announce it
      </label>
      <label className="field inline">
        <span>Largest goal the scout may use ($)</span>
        <input inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value)} onBlur={() => Number(max) !== maxGoalUsd && save(on)} />
      </label>
      {checked && <span className="muted small">Autopilot runs while your overlay is open. It waits a few minutes between challenges and looks again every few hours.</span>}
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
