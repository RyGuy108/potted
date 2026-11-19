"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updatePointsAction } from "@/app/actions";
import type { PointsConfig, Reward } from "@/lib/store";

type Row = Omit<Reward, "cost"> & { cost: string };

/** How planters earn this climber's points, and what they can spend them on. */
export function PointsSettings({ initial, max }: { initial: PointsConfig; max: number }) {
  const router = useRouter();
  const [on, setOn] = useState(initial.on);
  const [perUsd, setPerUsd] = useState(String(initial.perUsd));
  const [when, setWhen] = useState(initial.when);
  const [rows, setRows] = useState<Row[]>(initial.rewards.map((r) => ({ ...r, cost: String(r.cost) })));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const update = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const save = () =>
    start(async () => {
      setMessage(null);
      const result = await updatePointsAction({ on, perUsd: Number(perUsd), when, rewards: rows.map((r) => ({ ...r, cost: Number(r.cost) })) });
      setMessage(result.ok ? { ok: true, text: "Saved." } : { ok: false, text: result.error });
      if (result.ok) router.refresh();
    });
  return (
    <div className="points-settings">
      <label className="check">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
        Channel points on: planters earn points from their pledges and spend them on your rewards
      </label>
      <div className="row wrap">
        <label className="field">
          <span>Points per $1 pledged</span>
          <input inputMode="numeric" value={perUsd} onChange={(e) => setPerUsd(e.target.value)} />
        </label>
        <label className="field">
          <span>When points land</span>
          <select value={when} onChange={(e) => setWhen(e.target.value as PointsConfig["when"])}>
            <option value="pledged">When they pledge (refunds take them back)</option>
            <option value="completed">Only when a challenge is completed</option>
          </select>
        </label>
      </div>
      <p className="muted small">At this rate a $5 pledge earns {(Number(perUsd) * 5 || 0).toLocaleString()} points.</p>
      <div className="reward-editor">
        <span className="head">Reward</span>
        <span className="head">Cost</span>
        <span className="head">What they get</span>
        <span className="head">Asks for text</span>
        <span className="head">On</span>
        <span className="head" />
        {rows.map((r, i) => (
          <div key={r.id} style={{ display: "contents" }}>
            <input aria-label={`Reward ${i + 1} name`} value={r.title} maxLength={60} onChange={(e) => update(i, { title: e.target.value })} />
            <input aria-label={`Reward ${i + 1} cost`} inputMode="numeric" value={r.cost} onChange={(e) => update(i, { cost: e.target.value })} />
            <input aria-label={`Reward ${i + 1} description`} value={r.note} maxLength={140} onChange={(e) => update(i, { note: e.target.value })} />
            <input type="checkbox" aria-label={`Reward ${i + 1} asks for text`} checked={r.needsInput} onChange={(e) => update(i, { needsInput: e.target.checked })} />
            <input type="checkbox" aria-label={`Reward ${i + 1} on`} checked={r.enabled} onChange={(e) => update(i, { enabled: e.target.checked })} />
            <button type="button" className="btn btn-ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="row">
        {rows.length < max && (
          <button type="button" className="btn btn-ghost" onClick={() => setRows([...rows, { id: `new-${Date.now()}`, title: "", cost: "500", note: "", needsInput: false, enabled: true }])}>
            Add a reward
          </button>
        )}
        <button type="button" className="btn btn-primary" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save points"}
        </button>
        {message && <span className={message.ok ? "success" : "error"} role={message.ok ? "status" : "alert"}>{message.text}</span>}
      </div>
    </div>
  );
}
