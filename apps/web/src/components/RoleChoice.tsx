"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { chooseRoleAction } from "@/app/actions";
import { Beanstalk } from "./Beanstalk";

interface RoleText {
  label: string;
  blurb: string;
}

type Choice = "fan" | "streamer" | "mod";

export function RoleChoice({
  planter,
  climber,
  keeper,
  only,
}: {
  planter: RoleText;
  climber: RoleText;
  /** Offered only when the server has a keeper invite code set. */
  keeper?: RoleText;
  /** Skip the choice: the person already picked on the sign-up page. */
  only?: Choice;
}) {
  const router = useRouter();
  const [role, setRole] = useState<Choice>(only ?? "fan");
  const [handle, setHandle] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const option = (value: Choice, text: RoleText, stage: number, detail: string) => (
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
          const result = await chooseRoleAction(role, handle, code);
          if (!result.ok) return setError(result.error);
          router.push(role === "streamer" ? "/dashboard" : role === "mod" ? "/reviews" : "/");
          router.refresh();
        });
      }}
    >
      {!only && <div className={keeper ? "roles roles-3" : "roles"} role="radiogroup" aria-label="Account type">
        {option("fan", planter, 1, "Pledge to challenges, earn levels and badges, get refunded on a miss.")}
        {option("streamer", climber, 4, "Open challenges, share your page and overlay, get paid when you deliver.")}
        {keeper && option("mod", keeper, 2, "Settle disputed clips. Needs an invite code from the Potted team.")}
      </div>}
      {role === "mod" && (
        <label className="field">
          <span>Keeper invite code</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" maxLength={100} required />
        </label>
      )}
      {role === "streamer" && (
        <label className="field">
          <span>Your stream address</span>
          <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="yourname" maxLength={20} required />
          <span className="muted small">Fans will find you at /s/{handle.trim().toLowerCase() || "yourname"}</span>
        </label>
      )}
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn btn-primary btn-lg" disabled={pending}>
          {pending ? "Setting up…" : role === "fan" ? "Start planting" : role === "mod" ? "Start keeping" : "Start climbing"}
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
