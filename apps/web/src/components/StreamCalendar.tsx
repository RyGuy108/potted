"use client";

import { useState } from "react";
import type { StreamEntry } from "@/lib/account-types";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLabel = new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeZone: "UTC" });

export function StreamCalendar({
  entries,
  zone,
  today,
}: {
  entries: StreamEntry[];
  zone: string;
  today: string;
}) {
  const dayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const clock = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeStyle: "short" });
  const endDate = new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "short", day: "numeric" });
  const days = new Map<string, StreamEntry[]>();
  for (const entry of entries) {
    const key = dayKey.format(new Date(entry.startsAt));
    const sameDay = days.get(key);
    if (sameDay) sameDay.push(entry);
    else days.set(key, [entry]);
  }
  const initialDay = days.keys().next().value ?? today;
  const [selected, select] = useState(initialDay);
  const [month, setMonth] = useState(initialDay.slice(0, 7));
  const monthStart = new Date(`${month}-01T00:00:00Z`);
  const [year, monthIndex] = [monthStart.getUTCFullYear(), monthStart.getUTCMonth()];
  const visible = selected.startsWith(month)
    ? selected
    : [...days.keys()].find((key) => key.startsWith(month));
  const broadcasts = visible ? (days.get(visible) ?? []) : [];

  function moveMonth(offset: number) {
    setMonth(new Date(Date.UTC(year, monthIndex + offset, 1)).toISOString().slice(0, 7));
  }

  return (
    <div className="stream-calendar">
      <div className="stream-calendar-month">
        <button type="button" aria-label="Previous month" onClick={() => moveMonth(-1)}>
          ‹
        </button>
        <strong aria-live="polite">{monthLabel.format(monthStart)}</strong>
        <button type="button" aria-label="Next month" onClick={() => moveMonth(1)}>
          ›
        </button>
      </div>
      <div className="stream-calendar-grid">
        {weekdays.map((day) => (
          <span key={day} className="stream-calendar-weekday">
            {day}
          </span>
        ))}
        {Array.from({ length: 42 }, (_, i) => {
          const date = new Date(Date.UTC(year, monthIndex, i + 1 - monthStart.getUTCDay()));
          const key = date.toISOString().slice(0, 10);
          if (!key.startsWith(month)) return <span key={key} aria-hidden="true" />;
          const count = days.get(key)?.length ?? 0;
          return (
            <button
              key={key}
              type="button"
              className={count ? "has-stream" : undefined}
              aria-label={`${dayLabel.format(date)}, ${count} scheduled ${count === 1 ? "stream" : "streams"}`}
              aria-current={key === today ? "date" : undefined}
              aria-pressed={key === visible}
              onClick={() => select(key)}
            >
              {date.getUTCDate()}
            </button>
          );
        })}
      </div>
      <div className="stream-calendar-agenda">
        <h3 aria-live="polite">
          {visible ? dayLabel.format(new Date(`${visible}T00:00:00Z`)) : "No streams scheduled this month"}
        </h3>
        {visible &&
          (broadcasts.length ? (
            <ul aria-label="Scheduled streams" tabIndex={0}>
              {broadcasts.map((entry) => {
                const start = new Date(entry.startsAt);
                const end = entry.endsAt ? new Date(entry.endsAt) : undefined;
                return (
                  <li key={entry.id}>
                    <span className="mono small">
                      {clock.format(start)}
                      {end &&
                        ` – ${dayKey.format(end) === visible ? "" : `${endDate.format(end)} `}${clock.format(end)}`}
                    </span>
                    <a href={entry.url} target="_blank" rel="noreferrer">
                      {entry.title} ↗
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted small">No streams scheduled for this day.</p>
          ))}
      </div>
    </div>
  );
}
