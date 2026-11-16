"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";

/** A button that runs a server action and shows its error inline. */
export function ActionButton({
  action,
  children,
  variant = "primary",
  confirm,
}: {
  action: () => Promise<ActionResult>;
  children: React.ReactNode;
  variant?: "primary" | "ghost" | "danger";
  confirm?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (confirm && !window.confirm(confirm)) return;
    setError(null);
    start(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  return (
    <span className="action">
      <button type="button" className={`btn btn-${variant}`} onClick={onClick} disabled={pending}>
        {pending ? "Working…" : children}
      </button>
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
