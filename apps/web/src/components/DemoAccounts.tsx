"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useDemoAccountAction } from "@/app/actions";

export interface DemoAccount {
  id: string;
  label: string;
  note: string;
  group: string;
  home: string;
}

/** One click into an account that already exists in the demo. */
export function DemoAccounts({ accounts }: { accounts: DemoAccount[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const groups = [...new Set(accounts.map((a) => a.group))];
  return (
    <div className="demo-accounts">
      {groups.map((group) => (
        <div key={group} className="demo-group">
          <span className="eyebrow">{group}</span>
          <div className="sample-list">
            {accounts
              .filter((a) => a.group === group)
              .map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="btn btn-ghost sample-account"
                  aria-label={a.label}
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      setError(null);
                      const result = await useDemoAccountAction(a.id);
                      if (!result.ok) return setError(result.error);
                      router.push(a.home);
                      router.refresh();
                    })
                  }
                >
                  <strong>{a.label}</strong>
                  <span className="muted small">{a.note}</span>
                </button>
              ))}
          </div>
        </div>
      ))}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
