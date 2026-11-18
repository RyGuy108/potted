"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { markNoticesReadAction, noticesAction } from "@/app/actions";

type Item = Awaited<ReturnType<typeof noticesAction>>["items"][number];

const POLL_MS = 20_000;

const ICON: Record<string, string> = {
  award: "★",
  challenge: "◆",
  money: "$",
  refund: "↩",
  clip: "▶",
  dispute: "!",
  idea: "✦",
  invite: "⇄",
  points: "◈",
  follow: "♥",
  gift: "♥",
};

const ago = (at: number) => {
  const mins = Math.round((Date.now() - at) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
};

/**
 * The header's bell. A red dot means unread notices; opening the panel
 * marks them read. New ones that arrive while the page is open also slide
 * in as a toast.
 */
export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<Item[]>([]);
  const [toast, setToast] = useState<Item | null>(null);
  const newest = useRef<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async (announce: boolean) => {
    const data = await noticesAction();
    setUnread(data.unread);
    setItems(data.items);
    const top = data.items[0];
    // Toast what arrived since the last look, or, on a page load, anything unread from the last half minute.
    const fresh = top && !top.read && (announce ? newest.current !== null && top.id !== newest.current : Date.now() - top.at < 30_000);
    if (fresh && top) {
      setToast(top);
      setTimeout(() => setToast((t) => (t?.id === top.id ? null : t)), 5000);
    }
    if (top) newest.current = top.id;
    else newest.current ??= "";
  }, []);

  useEffect(() => {
    void load(false);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Close on a click outside or Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      await load(false);
      if (unread > 0) {
        await markNoticesReadAction();
        setUnread(0);
      }
    } else {
      setItems((list) => list.map((i) => ({ ...i, read: true })));
    }
  };

  return (
    <div className="bell-wrap" ref={box}>
      <button type="button" className={`bell${unread > 0 ? " has-unread" : ""}`} aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"} aria-expanded={open} onClick={toggle}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M12 3a6 6 0 0 0-6 6v3.6L4.3 15.3A1 1 0 0 0 5.1 17h13.8a1 1 0 0 0 .8-1.7L18 12.6V9a6 6 0 0 0-6-6Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M9.5 19.5a2.5 2.5 0 0 0 5 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {unread > 0 && <span className="bell-dot" aria-hidden="true" />}
      </button>

      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <strong>Notifications</strong>
          </div>
          {items.length === 0 ? (
            <p className="muted small bell-empty">Nothing yet. Pledges, results, awards and the climbers you follow show up here.</p>
          ) : (
            <ul className="bell-list">
              {items.map((n) => (
                <li key={n.id} className={n.read ? "" : "unread"}>
                  <Link href={n.href} onClick={() => setOpen(false)}>
                    <span className={`bell-icon kind-${n.kind}`} aria-hidden="true">
                      {ICON[n.kind] ?? "•"}
                    </span>
                    <span className="bell-text">
                      <strong>{n.title}</strong>
                      {n.body && <span className="muted small">{n.body}</span>}
                    </span>
                    <span className="muted small bell-time">{ago(n.at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {toast && !open && (
        <Link href={toast.href} className={`bell-toast kind-${toast.kind}`} onClick={() => setToast(null)}>
          <span className={`bell-icon kind-${toast.kind}`} aria-hidden="true">
            {ICON[toast.kind] ?? "•"}
          </span>
          <span className="bell-text">
            <strong>{toast.title}</strong>
            {toast.body && <span className="muted small">{toast.body}</span>}
          </span>
        </Link>
      )}
    </div>
  );
}
