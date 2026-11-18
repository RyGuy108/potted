"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { followAction } from "@/app/actions";

/** Follow a climber to hear when they open a challenge or go live. */
export function FollowButton({ handle, name, following }: { handle: string; name: string; following: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(following);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={`btn ${on ? "btn-ghost follow-on" : "btn-primary"} follow`}
      aria-pressed={on}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const next = !on;
          setOn(next);
          const result = await followAction(handle, next);
          if (!result.ok) setOn(!next);
          router.refresh();
        })
      }
      title={on ? `Stop following ${name}` : `Hear when ${name} opens a challenge or goes live`}
    >
      {on ? "Following ✓" : "Follow"}
    </button>
  );
}
