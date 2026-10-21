"use client";
import Link from "next/link";
import { useState } from "react";
import { rawAttendanceURL } from "../lib/attendanceTrends";
import { insightDate } from "./DataInsightsFrame";
import styles from "./DataInsights.module.css";

export interface WeekdayBar {
  key: string;
  /** Weekday shown in the first column; blank for a compared AO's row. */
  day: string;
  /** Spoken name for the row, such as "Tuesdays at Grizzly Bar". */
  name: string;
  average: number | null;
  workouts: number;
  list: { date: string; site: string; pax: number }[];
  color?: string;
  note?: string;
}

/** Turnout-by-day bars; tapping one lists that weekday's workouts, each linked to its rows. */
export default function WeekdayBars({
  bars,
  max,
  showSite,
}: {
  bars: WeekdayBar[];
  max: number;
  showSite: boolean;
}) {
  const [open, setOpen] = useState("");
  return (
    <ul className={styles.weekdayBars}>
      {bars.map((b) => (
        <li key={b.key}>
          <button
            type="button"
            className={styles.weekdayRow}
            disabled={!b.workouts}
            aria-expanded={open === b.key}
            aria-label={`${b.name}: ${b.average == null ? "no workouts" : `${b.average.toFixed(1)} average PAX over ${b.workouts} ${b.workouts === 1 ? "workout" : "workouts"}`}`}
            onClick={() => setOpen(open === b.key ? "" : b.key)}
          >
            <span>{b.day}</span>
            <span className={styles.weekdayTrack}>
              {b.average != null && (
                <span
                  className={styles.weekdayFill}
                  style={{
                    width: `${(b.average / max) * 100}%`,
                    ...(b.color ? { backgroundColor: b.color } : {}),
                  }}
                />
              )}
            </span>
            <strong>{b.average == null ? "" : b.average.toFixed(1)}</strong>
            <small>
              {b.workouts
                ? `${b.workouts} ${b.workouts === 1 ? "workout" : "workouts"}`
                : "No workouts"}
              {b.note ? ` · ${b.note}` : ""}
              {b.workouts ? (
                <b aria-hidden="true">{open === b.key ? " ˄" : " ˅"}</b>
              ) : null}
            </small>
          </button>
          {open === b.key && (
            <ol className={styles.weekdayList} aria-label={b.name}>
              {b.list.map((w) => (
                <li key={w.date + w.site}>
                  <Link href={rawAttendanceURL(w.site, w.date, w.date)}>
                    <span>
                      {insightDate(w.date, true)}
                      {showSite ? ` · ${w.site}` : ""}
                    </span>
                    <strong>{w.pax} PAX</strong>
                    <b aria-hidden="true">›</b>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </li>
      ))}
    </ul>
  );
}
