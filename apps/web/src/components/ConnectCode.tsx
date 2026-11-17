"use client";

import { useEffect, useState } from "react";

/**
 * Puts the token in the address after the #, where the extension reads
 * it. That part of an address is never sent to a server. The code is also
 * shown for pasting, in case the extension cannot see the tab.
 */
export function ConnectCode({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    window.location.hash = `potted-token=${token}`;
  }, [token]);
  return (
    <section className="card connect">
      <p className="muted small">If the extension still says "not connected", paste this code into it:</p>
      <div className="row">
        <input readOnly value={token} aria-label="Connection code" onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          className="btn btn-ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(token);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="muted small">Treat this code like a password. It signs the extension in as you for 30 days.</p>
    </section>
  );
}
