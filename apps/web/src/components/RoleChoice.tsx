"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { chooseRoleAction } from "@/app/actions";
import { Beanstalk } from "./Beanstalk";

interface RoleText {
  label: string;
  blurb: string;
}

export function RoleChoice({ planter, climber }: { planter: RoleText; climber: RoleText }) {
  const router = useRouter();
  const [role, setRole] = useState<"fan" | "streamer">("fan");
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const option = (value: "fan" | "streamer", text: RoleText, stage: number, detail: string) => (
    <button type="button" role="radio" aria-checked={role === value} className={role === value ? "card role role-on" : "card role"} onClick={() => setRole(value)}>
      <Beanstalk stage={stage} size={64} />
      <strong>{text.label}</strong>
      <span>{text.blurb}</span>
      <span className="muted small">{detail}</span>
    </button>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const result = await chooseRoleAction(role, handle);
          if (!result.ok) return setError(result.error);
          router.push(role === "streamer" ? "/dashboard" : "/");
          router.refresh();
        });
      }}
    >
      <div className="roles" role="radiogroup" aria-label="Account type">
        {option("fan", planter, 1, "Pledge to challenges, earn levels and badges, get refunded on a miss.")}
        {option("streamer", climber, 4, "Open challenges, share your page and overlay, get paid when you deliver.")}
      </div>
      {role === "streamer" && (
        <label className="field">
          <span>Your stream address</span>
          <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="yourname" maxLength={20} required />
          <span className="muted small">Fans will find you at /s/{handle.trim().toLowerCase() || "yourname"}</span>
        </label>
      )}
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn btn-primary btn-lg" disabled={pending}>
          {pending ? "Setting up…" : role === "fan" ? "Start planting" : "Start climbing"}
        </button>
        {error && (
          <span className="error" role="alert">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
