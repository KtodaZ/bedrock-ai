"use client";
import type { DataRow } from "../lib/dataExplorer";
import { monthlyActivity } from "../lib/paxActivity";
import LineChart from "./LineChart";
import styles from "./DataExplorer.module.css";

const SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const monthName = (month: string, longYear = false) => {
  const [y, m] = month.split("-");
  return `${SHORT[Number(m) - 1]} ${longYear ? y : "’" + y.slice(2)}`;
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Twelve small months; tapping one opens it in the month calendar. */
export function PaxYear({
  rows,
  year,
  setYear,
  firstYear,
  lastYear,
  openMonth,
}: {
  rows: DataRow[];
  year: number;
  setYear: (year: number) => void;
  firstYear: number;
  lastYear: number;
  openMonth: (month: string) => void;
}) {
  const days = new Map<string, { posts: number; q: boolean }>();
  for (const r of rows) {
    if (!r.post || !r.date.startsWith(String(year))) continue;
    const d = days.get(r.date) ?? { posts: 0, q: false };
    d.posts++;
    d.q ||= r.q;
    days.set(r.date, d);
  }
  const yearPosts = [...days.values()].reduce((sum, d) => sum + d.posts, 0);
  return (
    <>
      <div className={styles.sectionHeading}>
        <p className={styles.yearTotal}>
          {plural(yearPosts, "post")} in {year}
        </p>
        <div className={styles.monthControls}>
          <button
            aria-label="Previous year"
            disabled={year <= firstYear}
            onClick={() => setYear(year - 1)}
          >
            ‹
          </button>
          <span className={styles.yearLabel} aria-live="polite">
            {year}
          </span>
          <button
            aria-label="Next year"
            disabled={year >= lastYear}
            onClick={() => setYear(year + 1)}
          >
            ›
          </button>
        </div>
      </div>
      <div className={styles.yearGrid}>
        {SHORT.map((label, i) => {
          const month = `${year}-${String(i + 1).padStart(2, "0")}`;
          const first = new Date(Date.UTC(year, i, 1)).getUTCDay();
          const count = new Date(Date.UTC(year, i + 1, 0)).getUTCDate();
          let posts = 0,
            qs = 0;
          const cells = Array.from({ length: count }, (_, d) => {
            const day = days.get(`${month}-${String(d + 1).padStart(2, "0")}`);
            if (day) {
              posts += day.posts;
              if (day.q) qs++;
            }
            return (
              <span
                key={d}
                className={
                  day?.q ? styles.miniQ : day ? styles.miniPost : undefined
                }
              />
            );
          });
          return (
            <button
              key={month}
              className={styles.miniMonth}
              onClick={() => openMonth(month)}
              aria-label={`${label} ${year}: ${plural(posts, "post")}${qs ? `, ${plural(qs, "Q")}` : ""}. Open in month view.`}
            >
              <span className={styles.miniHeading}>
                {label}
                <small>{posts || ""}</small>
              </span>
              <span className={styles.miniDays} aria-hidden="true">
                {Array.from({ length: first }, (_, b) => (
                  <span key={`b${b}`} className={styles.miniBlank} />
                ))}
                {cells}
              </span>
            </button>
          );
        })}
      </div>
      <p className={styles.viewNote}>
        Purple = post · green = Q. Tap a month to open it.
      </p>
    </>
  );
}

/** Posts and Qs per month since the first recorded post. */
export function PaxOverTime({ rows, asOf }: { rows: DataRow[]; asOf: string }) {
  const months = monthlyActivity(rows, asOf);
  if (!months.length)
    return <p className={styles.viewNote}>No recorded workout posts.</p>;
  const busiest = months.reduce((a, b) => (b.posts > a.posts ? b : a));
  const full = months.length > 1 ? months.slice(0, -1) : months;
  const average = full.reduce((sum, m) => sum + m.posts, 0) / full.length;
  const hasQs = months.some((m) => m.qs);
  return (
    <>
      <dl className={styles.overTimeStats}>
        <div>
          <dt>Busiest month</dt>
          <dd>
            {busiest.posts} <small>{monthName(busiest.month, true)}</small>
          </dd>
        </div>
        <div>
          <dt>Monthly average</dt>
          <dd>{average.toFixed(1)}</dd>
        </div>
        <div>
          <dt>{monthName(months.at(-1)!.month, true)} so far</dt>
          <dd>{months.at(-1)!.posts}</dd>
        </div>
      </dl>
      {hasQs && (
        <ul className={styles.chartKey} aria-label="Graph series">
          <li>
            <span style={{ backgroundColor: "#c3a1ff" }} aria-hidden="true" />
            Posts
          </li>
          <li>
            <span style={{ backgroundColor: "#71d5c1" }} aria-hidden="true" />
            Qs
          </li>
        </ul>
      )}
      <LineChart
        series={[
          {
            name: "Posts",
            color: "#c3a1ff",
            values: months.map((m) => m.posts),
          },
          ...(hasQs
            ? [
                {
                  name: "Qs",
                  color: "#71d5c1",
                  values: months.map((m) => m.qs),
                },
              ]
            : []),
        ]}
        labels={months.map(
          (m, i) => monthName(m.month) + (i === months.length - 1 ? "*" : ""),
        )}
        title="Posts per month"
        description={`Recorded posts${hasQs ? " and Qs" : ""} each month from ${monthName(months[0].month, true)} through ${monthName(months.at(-1)!.month, true)}. The last month is partial.`}
        pointTitle={(name, i, value) =>
          `${monthName(months[i].month, true)}: ${plural(value, name === "Qs" ? "Q" : "post")}`
        }
      />
      <p className={styles.viewNote}>
        *{monthName(months.at(-1)!.month, true)} is partial. The monthly average
        leaves it out.
      </p>
    </>
  );
}
