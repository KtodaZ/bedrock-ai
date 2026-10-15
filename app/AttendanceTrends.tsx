"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  attendanceBuckets,
  attendanceValue,
  attendanceWorkouts,
  rawAttendanceURL,
  summarizeAttendance,
  type AttendanceBucket,
  type TrendMetric,
} from "../lib/attendanceTrends";
import { type ExplorerData } from "../lib/dataExplorer";
import DataInsightsFrame, { insightDate } from "./DataInsightsFrame";
import common from "./DataExplorer.module.css";
import styles from "./DataInsights.module.css";

const COLORS = ["#c3a1ff", "#71d5c1", "#f0bc77", "#88bafa"];
const METRICS: { key: TrendMetric; label: string }[] = [
  { key: "average", label: "Average PAX / workout" },
  { key: "posts", label: "Recorded posts / week" },
  { key: "pax", label: "Unique PAX / week" },
  { key: "workouts", label: "Recorded workouts / week" },
];
function readOptions() {
  const p = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  );
  return {
    weeks: [13, 26, 52].includes(Number(p.get("weeks")))
      ? Number(p.get("weeks"))
      : 13,
    metric: METRICS.some((m) => m.key === p.get("metric"))
      ? (p.get("metric") as TrendMetric)
      : "average",
    sites: [...new Set(p.getAll("ao").map((s) => s.slice(0, 200)))].slice(0, 4),
  };
}
interface Series {
  name: string;
  color: string;
  buckets: AttendanceBucket[];
}
function LineChart({
  series,
  metric,
}: {
  series: Series[];
  metric: TrendMetric;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  useEffect(() => {
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(300, entries[0].contentRect.width)),
    );
    if (chartRef.current) observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, []);
  const height = width < 600 ? 235 : 285,
    left = 45,
    right = 18,
    top = 18,
    bottom = 38;
  const allValues = series
    .flatMap((s) => s.buckets.map((b) => attendanceValue(b, metric)))
    .filter((v): v is number => v !== null);
  const max = Math.max(1, ...allValues),
    ceiling = Math.ceil(max / 4) * 4;
  const x = (i: number) =>
    left +
    (i / Math.max(1, series[0].buckets.length - 1)) * (width - left - right);
  const y = (v: number) => top + (1 - v / ceiling) * (height - top - bottom);
  const label = METRICS.find((m) => m.key === metric)!.label;
  return (
    <div ref={chartRef} className={styles.chartScroll}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={styles.lineChart}
        role="img"
        aria-labelledby="attendance-chart-title attendance-chart-desc"
      >
        <title id="attendance-chart-title">{label} over time</title>
        <desc id="attendance-chart-desc">
          {series.map((s) => s.name).join(", ")}. Missing records create gaps.
          The last week is partial. Exact weekly values are in the table below.
        </desc>
        {[0, 1, 2, 3, 4].map((i) => {
          const value = (ceiling * i) / 4;
          return (
            <g key={i}>
              <line
                x1={left}
                x2={width - right}
                y1={y(value)}
                y2={y(value)}
                stroke="#33283f"
                strokeDasharray={i === 0 ? undefined : "3 5"}
              />
              <text
                x={left - 10}
                y={y(value) + 4}
                textAnchor="end"
                fill="#b4a6c6"
                fontSize={width < 600 ? 10 : 12}
              >
                {value.toFixed(ceiling <= 10 ? 1 : 0)}
              </text>
            </g>
          );
        })}
        {series[0].buckets.map(
          (bucket, i, arr) =>
            (i % Math.ceil(arr.length / (width < 600 ? 4 : 7)) === 0 ||
              i === arr.length - 1) && (
              <text
                key={bucket.start}
                x={x(i)}
                y={height - 11}
                textAnchor={
                  i === 0 ? "start" : i === arr.length - 1 ? "end" : "middle"
                }
                fill="#b4a6c6"
                fontSize={width < 600 ? 10 : 12}
              >
                {insightDate(bucket.start)}
                {i === arr.length - 1 ? "*" : ""}
              </text>
            ),
        )}
        {series.map((s) => {
          let drawing = false;
          const path = s.buckets
            .map((b, i) => {
              const value = attendanceValue(b, metric);
              if (value === null) {
                drawing = false;
                return "";
              }
              const part = `${drawing ? "L" : "M"}${x(i)},${y(value)}`;
              drawing = true;
              return part;
            })
            .join(" ");
          return (
            <g key={s.name}>
              <path
                d={path}
                fill="none"
                stroke={s.color}
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {s.buckets.map((b, i) => {
                const value = attendanceValue(b, metric);
                return value === null ? null : (
                  <circle
                    key={b.start}
                    cx={x(i)}
                    cy={y(value)}
                    r="3.5"
                    fill={s.color}
                  >
                    <title>
                      {s.name}, week of {insightDate(b.start, true)}:{" "}
                      {value.toFixed(metric === "average" ? 1 : 0)}
                    </title>
                  </circle>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
export default function AttendanceTrends() {
  return (
    <DataInsightsFrame
      page="trends"
      title="Attendance trends"
      description="Compare turnout over time."
    >
      {(data) => <TrendsContent data={data} />}
    </DataInsightsFrame>
  );
}
function TrendsContent({ data }: { data: ExplorerData }) {
  const [options, setOptions] = useState(readOptions),
    [aoSearch, setAoSearch] = useState("");
  const { weeks, metric, sites } = options;
  const workouts = useMemo(() => attendanceWorkouts(data), [data]);
  const allSites = useMemo(
    () => [...new Set(workouts.map((w) => w.site))].filter(Boolean).sort(),
    [workouts],
  );
  const selectedSites = sites.filter((site) => allSites.includes(site));
  const heatmapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const params = new URLSearchParams({ weeks: String(weeks), metric });
    sites.forEach((site) => params.append("ao", site));
    window.history.replaceState(null, "", "/data/trends?" + params);
  }, [weeks, metric, sites]);
  useEffect(() => {
    const pop = () => setOptions(readOptions());
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (heatmapRef.current)
      heatmapRef.current.scrollLeft = heatmapRef.current.scrollWidth;
  }, [weeks]);
  const regionBuckets = useMemo(
    () => attendanceBuckets(workouts, data.asOf, weeks),
    [workouts, data.asOf, weeks],
  );
  const matrix = useMemo(
    () =>
      allSites.map((site) => ({
        site,
        buckets: attendanceBuckets(workouts, data.asOf, weeks, site),
      })),
    [allSites, workouts, data.asOf, weeks],
  );
  const series: Series[] = selectedSites.length
    ? selectedSites.map((site, i) => ({
        name: site,
        color: COLORS[i],
        buckets: matrix.find((row) => row.site === site)!.buckets,
      }))
    : [{ name: "All AOs", color: COLORS[0], buckets: regionBuckets }];
  const first = regionBuckets[0].start;
  const summary = summarizeAttendance(
    workouts,
    first,
    data.asOf,
    selectedSites,
  );
  const heatRows = matrix
    .filter(
      (row) =>
        (!selectedSites.length || selectedSites.includes(row.site)) &&
        row.buckets.some((b) => b.workouts),
    )
    .sort(
      (a, b) =>
        b.buckets.reduce((sum, p) => sum + p.posts, 0) -
          a.buckets.reduce((sum, p) => sum + p.posts, 0) ||
        a.site.localeCompare(b.site),
    );
  const heatMax = Math.max(
    1,
    ...heatRows.flatMap((row) => row.buckets.map((b) => b.average ?? 0)),
  );
  const setSites = (values: string[]) =>
    setOptions((o) => ({ ...o, sites: values }));
  return (
    <>
      <div className={`${styles.controls} ${styles.trendControls}`}>
        <label>
          Period
          <select
            aria-label="Attendance trend period"
            value={weeks}
            onChange={(e) =>
              setOptions((o) => ({ ...o, weeks: Number(e.target.value) }))
            }
          >
            <option value={13}>Last 13 weeks</option>
            <option value={26}>Last 26 weeks</option>
            <option value={52}>Last 52 weeks</option>
          </select>
        </label>
        <label className={styles.metricLabel}>
          Graph
          <select
            aria-label="Attendance graph metric"
            value={metric}
            onChange={(e) =>
              setOptions((o) => ({
                ...o,
                metric: e.target.value as TrendMetric,
              }))
            }
          >
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <details className={styles.compareControls}>
          <summary>
            Compare AOs
            {selectedSites.length ? ` · ${selectedSites.length} selected` : ""}
          </summary>
          <div>
            <label>
              Find an AO
              <input
                type="search"
                value={aoSearch}
                onChange={(e) => setAoSearch(e.target.value)}
                placeholder="Search AO names…"
              />
            </label>
            <p>Choose up to four AOs. None selected shows the whole region.</p>
            <fieldset>
              <legend className={common.srOnly}>AOs to compare</legend>
              {allSites
                .filter((site) =>
                  site.toLowerCase().includes(aoSearch.toLowerCase()),
                )
                .map((site) => (
                  <label key={site}>
                    <input
                      type="checkbox"
                      checked={selectedSites.includes(site)}
                      disabled={
                        !selectedSites.includes(site) &&
                        selectedSites.length >= 4
                      }
                      onChange={() =>
                        setSites(
                          selectedSites.includes(site)
                            ? selectedSites.filter((s) => s !== site)
                            : [...selectedSites, site],
                        )
                      }
                    />
                    {site}
                  </label>
                ))}
            </fieldset>
            {!allSites.some((site) =>
              site.toLowerCase().includes(aoSearch.toLowerCase()),
            ) && <p>No AO matches that name.</p>}
            <button
              onClick={() => {
                setSites([]);
                setAoSearch("");
              }}
            >
              Show all AOs together
            </button>
          </div>
        </details>
      </div>
      <dl
        className={styles.attendanceSummary}
        aria-label="Attendance in selected period"
      >
        {[
          ["Posts", summary.posts.toLocaleString()],
          ["Unique PAX", summary.pax.toLocaleString()],
          ["Workouts", summary.workouts.toLocaleString()],
          [
            "Avg turnout",
            summary.average == null ? "—" : summary.average.toFixed(1),
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <section
        className={styles.trendChart}
        aria-labelledby="attendance-trend-heading"
      >
        <div className={styles.chartTitle}>
          <h2 id="attendance-trend-heading">
            {METRICS.find((m) => m.key === metric)!.label}
          </h2>
          <p>
            {insightDate(first, true)} – {insightDate(data.asOf, true)}
          </p>
        </div>
        <ul className={styles.chartLegend} aria-label="Graph series">
          {series.map((s) => (
            <li key={s.name}>
              <span style={{ backgroundColor: s.color }} aria-hidden="true" />
              {s.name}
            </li>
          ))}
        </ul>
        <LineChart series={series} metric={metric} />
        <p className={styles.note}>
          *The last week is partial. Gaps mean no recorded workouts, not
          confirmed zero turnout.
        </p>
        <details className={styles.weeklyNumbers}>
          <summary>View weekly numbers</summary>
          <div
            className={common.tableScroll}
            tabIndex={0}
            role="region"
            aria-label="Weekly attendance values"
          >
            <table className={common.table}>
              <thead>
                <tr>
                  <th scope="col">Week of</th>
                  {series.map((s) => (
                    <th scope="col" key={s.name}>
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {regionBuckets.map((b, i) => (
                  <tr key={b.start}>
                    <td>
                      {insightDate(b.start, true)}
                      {i === regionBuckets.length - 1 ? "*" : ""}
                    </td>
                    {series.map((s) => {
                      const value = attendanceValue(s.buckets[i], metric);
                      return (
                        <td key={s.name}>
                          {value === null
                            ? "No records"
                            : value.toFixed(metric === "average" ? 1 : 0)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
      <section
        className={styles.heatSection}
        aria-labelledby="attendance-map-heading"
      >
        <div className={styles.chartTitle}>
          <h2 id="attendance-map-heading">Weekly turnout by AO</h2>
          <p>
            Average PAX per recorded workout · select a cell for the raw
            attendance
          </p>
        </div>
        <div className={styles.heatLegend}>
          <span>Lower turnout</span>
          {[0, 1, 2, 3].map((level) => (
            <i
              key={level}
              className={styles[`heat${level}`]}
              aria-hidden="true"
            />
          ))}
          <span>Higher turnout</span>
          <span>— No records</span>
        </div>
        {heatRows.length ? (
          <div
            ref={heatmapRef}
            className={styles.heatScroll}
            role="region"
            tabIndex={0}
            aria-label="Scrollable AO attendance heatmap"
          >
            <table className={styles.heatmap}>
              <caption className={common.srOnly}>
                Weekly average attendance by AO. Dates are Mondays; the last
                week is partial.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={styles.heatPinned}>
                    AO
                  </th>
                  {regionBuckets.map((b, i) => (
                    <th scope="col" key={b.start}>
                      {insightDate(b.start)}
                      {i === regionBuckets.length - 1 ? "*" : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatRows.map((row) => (
                  <tr key={row.site}>
                    <th scope="row" className={styles.heatPinned}>
                      {row.site}
                    </th>
                    {row.buckets.map((b) => (
                      <td key={b.start}>
                        {b.average === null ? (
                          <span
                            className={styles.noHeat}
                            title={`${row.site}, week of ${insightDate(b.start, true)}: No recorded workouts`}
                          >
                            —
                          </span>
                        ) : (
                          <Link
                            className={
                              styles[
                                `heat${Math.min(3, Math.floor((b.average / heatMax) * 4))}`
                              ]
                            }
                            href={rawAttendanceURL(row.site, b.start, b.end)}
                            title={`${row.site}, week of ${insightDate(b.start, true)}: ${b.average.toFixed(1)} average PAX, ${b.workouts} workouts`}
                            aria-label={`${row.site}, week of ${insightDate(b.start, true)}: ${b.average.toFixed(1)} average PAX across ${b.workouts} workouts. View attendance.`}
                          >
                            {b.average.toFixed(1)}
                          </Link>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.note}>
            No recorded workouts in this selection. Try a wider period or clear
            the AO comparison.
          </p>
        )}
      </section>
      <details className={common.definitions}>
        <summary>How attendance trends work</summary>
        <p>
          Only rows marked Post = 1 count. A workout is a recorded date + AO.
          Average turnout counts distinct PAX names per workout, then averages
          across workouts; region turnout is weighted by workouts, not an
          average of AO averages. Recorded posts count source rows, so duplicate
          name rows can increase posts without increasing distinct turnout.
          Qsource-only rows are excluded.
        </p>
        <p>
          Unique PAX counts each normalized name once within the selected week
          or summary period. AO comparisons use the same weeks. Summary counts
          combine the selected AOs and deduplicate shared PAX. The heatmap
          always shows average PAX per workout, regardless of the graph metric.
        </p>
        <p>
          Weeks run Monday–Sunday. The current week ends on the latest
          attendance date, {insightDate(data.asOf, true)}, so it may be
          incomplete. These graphs describe recorded attendance; missing data
          does not confirm an AO was closed. Sheet changes may take up to 10
          minutes to appear.
        </p>
      </details>
    </>
  );
}
