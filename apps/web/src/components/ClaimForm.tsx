"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { claimAction } from "@/app/actions";

/** Optimistic tier: the streamer posts the clip that shows the challenge done. */
export function ClaimForm({ challengeId }: { challengeId: string }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const result = await claimAction(challengeId, url);
          if (!result.ok) setError(result.error);
          router.refresh();
        });
      }}
    >
      <input
        aria-label="Clip link"
        placeholder="https://clips.twitch.tv/…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <button className="btn btn-primary" disabled={pending || url.trim() === ""}>
        {pending ? "Posting…" : "Post clip"}
      </button>
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
    </form>
  );
}
