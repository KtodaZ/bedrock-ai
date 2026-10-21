"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  attendanceBuckets,
  attendanceValue,
  attendanceWorkouts,
  rawAttendanceURL,
  type TrendMetric,
  type WorkoutAttendance,
} from "../lib/attendanceTrends";
import {
  AO_WEEKS,
  DRAW_MIN_QS,
  QUIET_DAYS,
  aoDetail,
  aoSummaries,
  aoURL,
  aoYearOverYear,
  aoYears,
  parseAoWeeks,
  yearChange,
  type AoDetail,
  type AoWeeks,
  type AoYearOverYear,
  type AoYearStats,
} from "../lib/aoProfile";
import {
  monthDays,
  normalizeDataName,
  type ExplorerData,
} from "../lib/dataExplorer";
import DataInsightsFrame, { insightDate } from "./DataInsightsFrame";
import LineChart from "./LineChart";
import Sparkline from "./Sparkline";
import SwipeViews from "./SwipeViews";
import common from "./DataExplorer.module.css";
import styles from "./DataInsights.module.css";

const METRICS: { key: TrendMetric; label: string; short: string }[] = [
  { key: "average", label: "Average PAX / workout", short: "Avg PAX" },
  { key: "posts", label: "Recorded posts / week", short: "Posts" },
  { key: "pax", label: "Unique PAX / week", short: "Unique PAX" },
  { key: "workouts", label: "Recorded workouts / week", short: "Workouts" },
];
const COLORS = ["#c3a1ff", "#71d5c1"];
/** Last year's line in the year-over-year chart. */
const LAST_YEAR = "#8d7fa3";
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const CHART_VIEWS = ["weekly", "yoy"] as const;
const LIST_SIZE = 10;
const profileURL = (name: string) =>
  "/data?" + new URLSearchParams({ period: "all", pax: name });
const plural = (n: number, word: string) =>
  `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;
const avg = (n: number | null) => (n == null ? "—" : n.toFixed(1));
const kindLabel = (kind: "run" | "beatdown" | null) =>
  kind === "run" ? "Run site" : kind === "beatdown" ? "Beatdown" : "";

export default function AoPages() {
  const params = useSearchParams();
  const site = params.get("ao")?.slice(0, 200) ?? "";
  return (
    <DataInsightsFrame
      page="aos"
      title={site || "AOs"}
      description={
        site
          ? "Recorded turnout, regulars, and Qs at this AO."
          : "Tap an AO for its turnout over time, regulars, Qs, and growth."
      }
    >
      {(data) =>
        site ? (
          <AoProfile key={site} data={data} site={site} />
        ) : (
          <AoIndex data={data} />
        )
      }
    </DataInsightsFrame>
  );
}

function AoIndex({ data }: { data: ExplorerData }) {
  const workouts = useMemo(() => attendanceWorkouts(data), [data]);
  const all = useMemo(() => aoSummaries(data, workouts), [data, workouts]);
  const [search, setSearch] = useState("");
  const matching = all.filter((a) =>
    a.site.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const active = matching.filter((a) => !a.quiet),
    quiet = matching.filter((a) => a.quiet);
  const row = (a: (typeof all)[number]) => (
    <li key={a.site}>
      <Link href={aoURL(a.site)} className={styles.aoRow}>
        <span className={styles.aoRowName}>
          <strong>{a.site}</strong>
          <small>
            {a.quiet
              ? `Last workout ${insightDate(a.lastWorkout, true)}`
              : [kindLabel(a.kind), a.days.join(" · "), a.city]
                  .filter(Boolean)
                  .join(" · ") || plural(a.workouts, "workout")}
          </small>
        </span>
        {!a.quiet && <Sparkline values={a.weekly} total={avg(a.average)} />}
        <span aria-hidden="true" className={styles.chevron}>
          ›
        </span>
      </Link>
    </li>
  );
  return (
    <>
      <div className={styles.controls}>
        <label className={styles.searchLabel}>
          Find an AO
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search AO names…"
          />
        </label>
      </div>
      <div className={styles.chartTitle}>
        <h2 id="active-aos-heading">Active AOs</h2>
        <p>Average PAX per workout, last 13 weeks</p>
      </div>
      {active.length ? (
        <ul className={styles.aoList}>{active.map(row)}</ul>
      ) : (
        <p className={styles.note}>No active AO matches that name.</p>
      )}
      {!!quiet.length && (
        <details className={styles.aoQuiet}>
          <summary>
            {plural(quiet.length, "other AO")} · inactive in the sheet or no
            workout in {QUIET_DAYS} days
          </summary>
          <ul className={styles.aoList}>{quiet.map(row)}</ul>
        </details>
      )}
      <p className={styles.note}>
        AOs come from recorded attendance. A workout is one date at one AO with
        at least one Post.
      </p>
    </>
  );
}

/** The People lists, in order; `list=` in the URL opens one. */
const AO_LISTS = ["pax", "qs", "draw", "biggest"];
function setParams(patch: Record<string, string>) {
  const params = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(patch))
    if (v) params.set(k, v);
    else params.delete(k);
  window.history.replaceState(null, "", "/data/aos?" + params);
}

function AoProfile({ data, site }: { data: ExplorerData; site: string }) {
  const params = useSearchParams();
  const workouts = useMemo(() => attendanceWorkouts(data), [data]);
  const sites = useMemo(() => aoSummaries(data, workouts), [data, workouts]);
  // Settings live in state and mirror to the URL for sharing.
  const [weeksOption, setWeeks] = useState<AoWeeks>(() =>
    parseAoWeeks(params.get("weeks")),
  );
  const [metric, setMetric] = useState<TrendMetric>(() => {
    const m = params.get("metric");
    return METRICS.some((x) => x.key === m) ? (m as TrendMetric) : "average";
  });
  const [vs, setVs] = useState(() => {
    const v = params.get("vs") ?? "";
    return v !== site && sites.some((s) => s.site === v) ? v : "";
  });
  const [list, setList] = useState(() =>
    Math.max(0, AO_LISTS.indexOf(params.get("list") ?? "")),
  );
  // The first recorded year has nothing to compare with unless it's the only one.
  const years = useMemo(() => {
    const all = aoYears(workouts, site);
    return all.length > 1 ? all.slice(0, -1) : all;
  }, [workouts, site]);
  const [chartView, setChartView] = useState(() =>
    params.get("chart") === "yoy" ? 1 : 0,
  );
  const [year, setYear] = useState(() => {
    const y = Number(params.get("year"));
    return years.includes(y) ? y : years[0];
  });
  const detail = useMemo(
    () => aoDetail(data, workouts, site, weeksOption),
    [data, workouts, site, weeksOption],
  );
  const other = useMemo(
    () => (vs ? aoDetail(data, workouts, vs, weeksOption) : null),
    [data, workouts, vs, weeksOption],
  );
  const update = (patch: {
    weeks?: AoWeeks;
    metric?: TrendMetric;
    vs?: string;
    chart?: number;
    year?: number;
  }) => {
    if (patch.chart !== undefined) setChartView(patch.chart);
    if (patch.year !== undefined) setYear(patch.year);
    if (patch.weeks !== undefined) setWeeks(patch.weeks);
    if (patch.metric !== undefined) setMetric(patch.metric);
    if (patch.vs !== undefined) setVs(patch.vs);
    setParams({
      ...(patch.weeks !== undefined && {
        weeks: patch.weeks === 13 ? "" : String(patch.weeks),
      }),
      ...(patch.metric !== undefined && {
        metric: patch.metric === "average" ? "" : patch.metric,
      }),
      ...(patch.vs !== undefined && { vs: patch.vs }),
      ...(patch.chart !== undefined && {
        chart: patch.chart ? CHART_VIEWS[patch.chart] : "",
      }),
      ...(patch.year !== undefined && {
        year: patch.year === years[0] ? "" : String(patch.year),
      }),
    });
  };
  if (!detail)
    return (
      <div className={common.empty}>
        <p>No recorded workouts at {site}.</p>
        <Link className={styles.textButton} href="/data/aos">
          See all AOs
        </Link>
      </div>
    );
  return (
    <>
      <Link href="/data/aos" className={styles.backLink}>
        ‹ All AOs
      </Link>
      <p className={styles.aoMeta}>
        {[
          kindLabel(detail.kind),
          detail.city,
          detail.days.length ? detail.days.join(" · ") : "",
          `Recorded since ${insightDate(detail.firstWorkout, true)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <div className={`${styles.controls} ${styles.aoControls}`}>
        <label>
          Period
          <select
            value={String(weeksOption)}
            onChange={(e) => update({ weeks: parseAoWeeks(e.target.value) })}
          >
            {AO_WEEKS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Compare with
          <select value={vs} onChange={(e) => update({ vs: e.target.value })}>
            <option value="">No comparison</option>
            {sites
              .filter((s) => s.site !== site)
              .map((s) => (
                <option key={s.site} value={s.site}>
                  {s.site}
                  {s.quiet ? " (inactive)" : ""}
                </option>
              ))}
          </select>
        </label>
      </div>
      <AoStats detail={detail} other={other} allTime={weeksOption === "all"} />
      <AoChart
        data={data}
        workouts={workouts}
        detail={detail}
        other={other}
        metric={metric}
        setMetric={(m) => update({ metric: m })}
        view={chartView}
        setView={(v) => update({ chart: v })}
        years={years}
        year={year}
        setYear={(y) => update({ year: y })}
      />
      <section className={styles.aoLists} aria-label="People at this AO">
        <div className={styles.chartTitle}>
          <h2 id="ao-people-heading">People</h2>
          <p>
            {insightDate(detail.from, true)} –{" "}
            {insightDate(detail.through, true)}
          </p>
        </div>
        <SwipeViews
          label="People at this AO"
          index={list}
          onIndexChange={(i) => {
            setList(i);
            setParams({ list: i ? AO_LISTS[i] : "" });
          }}
          views={[
            {
              key: "pax",
              label: "Top PAX",
              content: <TopPax detail={detail} />,
            },
            { key: "qs", label: "Top Qs", content: <TopQs detail={detail} /> },
            {
              key: "draw",
              label: "Best draw",
              content: <BestDraw detail={detail} />,
            },
            {
              key: "biggest",
              label: "Biggest",
              content: <Biggest detail={detail} />,
            },
          ]}
        />
      </section>
      <AoWeekdays detail={detail} other={other} />
      <section aria-labelledby="ao-fngs-heading">
        <div className={styles.chartTitle}>
          <h2 id="ao-fngs-heading">Bedrock FNGs who started here</h2>
          <p>{plural(detail.fngs.length, "FNG")} in this period</p>
        </div>
        {detail.fngs.length ? (
          <ul className={styles.aoFngs}>
            {detail.fngs.map((f) => (
              <li key={f.name}>
                <Link className={styles.nameLink} href={profileURL(f.name)}>
                  {f.name}
                </Link>
                <small>{insightDate(f.date, true)}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.note}>
            No Bedrock FNG made a first post here in this period.
          </p>
        )}
      </section>
      <p className={styles.note}>
        Counts use recorded attendance only; under-18 and archived PAX are not
        shown.{" "}
        <Link
          className={common.sourceLink}
          href={rawAttendanceURL(site, detail.from, detail.through)}
        >
          View every post here
        </Link>
      </p>
    </>
  );
}

function AoStats({
  detail,
  other,
  allTime,
}: {
  detail: AoDetail;
  other: AoDetail | null;
  allTime: boolean;
}) {
  const change = (d: AoDetail) =>
    d.change == null
      ? null
      : `${d.change >= 0 ? "+" : "−"}${Math.abs(d.change).toFixed(0)}%`;
  const stats: [string, (d: AoDetail) => string][] = [
    ["Avg PAX / workout", (d) => avg(d.average)],
    ["Workouts", (d) => d.workouts.toLocaleString("en-US")],
    ["Posts", (d) => d.posts.toLocaleString("en-US")],
    ["Unique PAX", (d) => d.pax.toLocaleString("en-US")],
    ["Bedrock FNGs", (d) => String(d.fngs.length)],
    ["Turnout change", (d) => change(d) ?? "—"],
  ];
  return (
    <>
      <dl className={styles.aoStats} aria-label="AO totals for this period">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd
              className={
                label === "Turnout change" && detail.change != null
                  ? detail.change >= 0
                    ? styles.pulseUp
                    : styles.pulseDown
                  : undefined
              }
            >
              {value(detail)}
            </dd>
            {other && (
              <small>
                <span
                  className={styles.aoSwatch}
                  style={{ backgroundColor: COLORS[1] }}
                  aria-hidden="true"
                />
                {other.site}: {value(other)}
              </small>
            )}
          </div>
        ))}
      </dl>
      <p className={styles.note}>
        {allTime
          ? "Turnout change needs an earlier period, so it isn’t shown for all time."
          : `Turnout change compares average PAX per workout with the ${detail.weeks} weeks before; it needs 3+ workouts in both periods.${
              detail.previous != null && detail.change != null
                ? ` ${detail.site} averaged ${detail.previous.toFixed(1)} before.`
                : ""
            }`}
      </p>
    </>
  );
}

function AoChart({
  data,
  workouts,
  detail,
  other,
  metric,
  setMetric,
  view,
  setView,
  years,
  year,
  setYear,
}: {
  data: ExplorerData;
  workouts: WorkoutAttendance[];
  detail: AoDetail;
  other: AoDetail | null;
  metric: TrendMetric;
  setMetric: (m: TrendMetric) => void;
  view: number;
  setView: (v: number) => void;
  years: number[];
  year: number;
  setYear: (y: number) => void;
}) {
  const series = [detail, ...(other ? [other] : [])].map((d, i) => ({
    name: d.site,
    color: COLORS[i],
    buckets: attendanceBuckets(workouts, data.asOf, detail.weeks, d.site),
  }));
  const buckets = series[0].buckets;
  const label = METRICS.find((m) => m.key === metric)!.label;
  const yoy = useMemo(
    () => aoYearOverYear(data, workouts, detail.site, year),
    [data, workouts, detail.site, year],
  );
  const otherYoy = useMemo(
    () => (other ? aoYearOverYear(data, workouts, other.site, year) : null),
    [data, workouts, other, year],
  );
  return (
    <section className={styles.trendChart} aria-labelledby="ao-chart-heading">
      <div className={styles.chartTitle}>
        <h2 id="ao-chart-heading">Over time</h2>
        <label className={styles.inlineSelect}>
          <span className={common.srOnly}>Graph</span>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as TrendMetric)}
          >
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {view ? m.label.replace("/ week", "/ month") : m.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <SwipeViews
        label="Over time views"
        index={view}
        onIndexChange={setView}
        views={[
          {
            key: "weekly",
            label: "Weekly",
            content: (
              <>
                {other && (
                  <ul className={styles.chartLegend} aria-label="Graph series">
                    {series.map((s) => (
                      <li key={s.name}>
                        <span
                          style={{ backgroundColor: s.color }}
                          aria-hidden="true"
                        />
                        {s.name}
                      </li>
                    ))}
                  </ul>
                )}
                <LineChart
                  series={series.map((s) => ({
                    name: s.name,
                    color: s.color,
                    values: s.buckets.map((b) => attendanceValue(b, metric)),
                  }))}
                  labels={buckets.map(
                    (b, i) =>
                      insightDate(b.start) +
                      (i === buckets.length - 1 ? "*" : ""),
                  )}
                  title={`${label} at ${series.map((s) => s.name).join(" and ")}`}
                  description="Weekly values. Missing records create gaps. The last week is partial."
                  pointTitle={(name, i, value) =>
                    `${name}, week of ${insightDate(buckets[i].start, true)}: ${value.toFixed(metric === "average" ? 1 : 0)}`
                  }
                  pointTarget={(name, i) =>
                    rawAttendanceURL(name, buckets[i].start, buckets[i].end)
                  }
                />
                <p className={styles.note}>
                  *The last week is partial. Gaps mean no recorded workouts.
                </p>
              </>
            ),
          },
          {
            key: "yoy",
            label: "Year over year",
            content: yoy ? (
              <AoYearView
                yoy={yoy}
                other={otherYoy}
                metric={metric}
                years={years}
                setYear={setYear}
              />
            ) : null,
          },
        ]}
      />
    </section>
  );
}

function AoYearView({
  yoy,
  other,
  metric,
  years,
  setYear,
}: {
  yoy: AoYearOverYear;
  other: AoYearOverYear | null;
  metric: TrendMetric;
  years: number[];
  setYear: (y: number) => void;
}) {
  const last = yoy.year - 1;
  const range = (from: string, through: string) =>
    `${insightDate(from)} – ${insightDate(through, true)}`;
  const pct = (n: number | null) =>
    n == null ? null : `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(0)}%`;
  const diff = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "±0");
  const workouts = (y: AoYearOverYear) => ({
    current: y.current.workouts,
    previous: y.previous.workouts,
  });
  const stats: {
    label: string;
    value: (s: AoYearStats) => string;
    change: (y: AoYearOverYear) => { text: string; up: boolean } | null;
  }[] = (
    [
      ["Avg PAX / workout", "average"],
      ["Workouts", "workouts"],
      ["Posts", "posts"],
      ["Unique PAX", "pax"],
    ] as const
  ).map(([label, key]) => ({
    label,
    value: (s) =>
      key === "average" ? avg(s.average) : s[key].toLocaleString("en-US"),
    change: (y) => {
      const n = yearChange(y.current[key], y.previous[key], workouts(y));
      return n == null ? null : { text: pct(n)!, up: n >= 0 };
    },
  }));
  stats.push({
    label: "Bedrock FNGs",
    value: (s) => String(s.fngs),
    change: (y) => {
      const n = y.current.fngs - y.previous.fngs;
      return y.previous.workouts ? { text: diff(n), up: n >= 0 } : null;
    },
  });
  const tone = (c: { up: boolean } | null) =>
    c ? (c.up ? styles.pulseUp : styles.pulseDown) : undefined;
  const months = yoy.months;
  const partialMonth = yoy.partial
    ? Number(yoy.through.slice(5, 7))
    : undefined;
  const value = (b: (typeof months)[number]["current"]) =>
    b ? attendanceValue(b, metric) : null;
  const label = METRICS.find((m) => m.key === metric)!.label.replace(
    "/ week",
    "/ month",
  );
  return (
    <div className={styles.yoy}>
      <div className={styles.yoyHead}>
        <p>
          {yoy.partial
            ? `${range(yoy.from, yoy.through)} vs the same dates in ${last}`
            : `${yoy.year} vs ${last}`}
        </p>
        <label className={styles.inlineSelect}>
          <span className={common.srOnly}>Year</span>
          <select
            value={yoy.year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y} vs {y - 1}
              </option>
            ))}
          </select>
        </label>
      </div>
      <dl
        className={styles.aoStats}
        aria-label={`${yoy.site} in ${yoy.year} compared with ${last}`}
      >
        {stats.map((s) => {
          const change = s.change(yoy);
          const otherChange = other && s.change(other);
          return (
            <div key={s.label}>
              <dt>{s.label}</dt>
              <dd>
                {s.value(yoy.current)}{" "}
                {change && (
                  <span className={`${styles.yoyChange} ${tone(change)}`}>
                    {change.text}
                  </span>
                )}
              </dd>
              <small>
                {last}: {yoy.previous.workouts ? s.value(yoy.previous) : "—"}
              </small>
              {other && (
                <small>
                  <span
                    className={styles.aoSwatch}
                    style={{ backgroundColor: COLORS[1] }}
                    aria-hidden="true"
                  />
                  {other.site}:
                  <span className={tone(otherChange)}>
                    {otherChange?.text ?? "—"}
                  </span>
                </small>
              )}
            </div>
          );
        })}
      </dl>
      <ul className={styles.chartLegend} aria-label="Graph series">
        <li>
          <span style={{ backgroundColor: COLORS[0] }} aria-hidden="true" />
          {yoy.year}
        </li>
        <li>
          <span style={{ backgroundColor: LAST_YEAR }} aria-hidden="true" />
          {last}
        </li>
      </ul>
      <LineChart
        series={[
          {
            name: String(yoy.year),
            color: COLORS[0],
            values: months.map((m) => value(m.current)),
          },
          {
            name: String(last),
            color: LAST_YEAR,
            values: months.map((m) => value(m.previous)),
          },
        ]}
        labels={months.map(
          (m) => MONTHS[m.month - 1] + (m.month === partialMonth ? "*" : ""),
        )}
        title={`${label} at ${yoy.site}, ${yoy.year} and ${last}`}
        description="Monthly values for each year. Missing records create gaps."
        pointTitle={(name, i, v) =>
          `${MONTHS[i]} ${name}: ${v.toFixed(metric === "average" ? 1 : 0)}`
        }
        pointTarget={(name, i) =>
          rawAttendanceURL(
            yoy.site,
            ...monthDays(Number(name), months[i].month),
          )
        }
      />
      <p className={styles.note}>
        {partialMonth
          ? `*${MONTHS[partialMonth - 1]} ${yoy.year} is partial; the totals above stop at the same date both years. `
          : ""}
        {yoy.firstWorkout > yoy.previousFrom &&
        yoy.firstWorkout <= yoy.previousThrough
          ? `Records here start ${insightDate(yoy.firstWorkout, true)}, so ${last} is incomplete. `
          : yoy.firstWorkout > yoy.previousThrough
            ? `No workouts are recorded here in ${last}. `
            : ""}
        Percent changes need 3+ workouts in both years. Gaps mean no recorded
        workouts.
      </p>
    </div>
  );
}

function ShowAll({
  count,
  open,
  toggle,
}: {
  count: number;
  open: boolean;
  toggle: () => void;
}) {
  if (count <= LIST_SIZE) return null;
  return (
    <button className={styles.textButton} onClick={toggle}>
      {open ? `Show top ${LIST_SIZE}` : `Show all ${count}`}
    </button>
  );
}
function PersonTable({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: { key: string; name?: string; cells: string[] }[];
}) {
  return (
    <table className={`${common.table} ${styles.aoTable}`}>
      <caption className={common.srOnly}>{caption}</caption>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.key}>
            <td>
              <span className={styles.aoRank}>{i + 1}</span>
              {r.name ? (
                <Link className={styles.nameLink} href={profileURL(r.name)}>
                  {r.name}
                </Link>
              ) : (
                r.cells[0]
              )}
            </td>
            {r.cells.slice(r.name ? 0 : 1).map((c, j) => (
              <td key={j}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function TopPax({ detail }: { detail: AoDetail }) {
  const [all, setAll] = useState(false);
  const rows = detail.topPax.slice(0, all ? undefined : LIST_SIZE);
  return (
    <>
      <PersonTable
        caption="PAX with the most posts here"
        head={["PAX", "Posts", "Of workouts"]}
        rows={rows.map((p) => ({
          key: normalizeDataName(p.name),
          name: p.name,
          cells: [String(p.posts), `${Math.round(p.share)}%`],
        }))}
      />
      <ShowAll
        count={detail.topPax.length}
        open={all}
        toggle={() => setAll((v) => !v)}
      />
    </>
  );
}
function TopQs({ detail }: { detail: AoDetail }) {
  const [all, setAll] = useState(false);
  if (!detail.topQs.length)
    return <p className={styles.note}>No recorded Qs here in this period.</p>;
  return (
    <>
      <PersonTable
        caption="PAX who Q'd here most"
        head={["Q", "Qs", "Last Q"]}
        rows={detail.topQs.slice(0, all ? undefined : LIST_SIZE).map((q) => ({
          key: normalizeDataName(q.name),
          name: q.name,
          cells: [String(q.qs), insightDate(q.lastQ, true)],
        }))}
      />
      <ShowAll
        count={detail.topQs.length}
        open={all}
        toggle={() => setAll((v) => !v)}
      />
    </>
  );
}
function BestDraw({ detail }: { detail: AoDetail }) {
  const [all, setAll] = useState(false);
  return (
    <>
      {detail.draws.length ? (
        <PersonTable
          caption="Qs ranked by average turnout"
          head={["Q", "Avg PAX", "Qs"]}
          rows={detail.draws.slice(0, all ? undefined : LIST_SIZE).map((q) => ({
            key: normalizeDataName(q.name),
            name: q.name,
            cells: [q.average.toFixed(1), String(q.qs)],
          }))}
        />
      ) : (
        <p className={styles.note}>
          No one Q’d here {DRAW_MIN_QS}+ times in this period.
        </p>
      )}
      <ShowAll
        count={detail.draws.length}
        open={all}
        toggle={() => setAll((v) => !v)}
      />
      <p className={styles.note}>
        Average PAX at workouts each Q led here, {DRAW_MIN_QS}+ Qs. The AO
        averaged {avg(detail.average)}. Turnout also depends on the day,
        weather, and season.
      </p>
    </>
  );
}
function Biggest({ detail }: { detail: AoDetail }) {
  return (
    <>
      <PersonTable
        caption="Biggest recorded workouts here"
        head={["Date", "PAX", "Q"]}
        rows={detail.biggest.slice(0, LIST_SIZE).map((w) => ({
          key: w.date,
          cells: [
            insightDate(w.date, true),
            String(w.pax),
            w.qs.join(", ") || "—",
          ],
        }))}
      />
    </>
  );
}

function AoWeekdays({
  detail,
  other,
}: {
  detail: AoDetail;
  other: AoDetail | null;
}) {
  const rows = [detail, ...(other ? [other] : [])];
  const max = Math.max(
    1,
    ...rows.flatMap((d) => d.weekdays.map((w) => w.average ?? 0)),
  );
  const days = detail.weekdays
    .map((d, i) => ({ day: d.day, values: rows.map((r) => r.weekdays[i]) }))
    .filter((d) => d.values.some((v) => v.workouts));
  return (
    <section
      className={styles.weekdaySection}
      aria-labelledby="ao-weekday-heading"
    >
      <div className={styles.chartTitle}>
        <h2 id="ao-weekday-heading">Turnout by day</h2>
        <p>Average PAX per workout · days with a recorded workout</p>
      </div>
      <ul className={styles.weekdayBars}>
        {days.map((d) =>
          d.values.map((v, i) => (
            <li key={d.day + i}>
              <span>{i ? "" : d.day}</span>
              <span className={styles.weekdayTrack}>
                {v.average != null && (
                  <span
                    className={styles.weekdayFill}
                    style={{
                      width: `${(v.average / max) * 100}%`,
                      ...(i ? { backgroundColor: COLORS[1] } : {}),
                    }}
                  />
                )}
              </span>
              <strong>{v.average == null ? "" : v.average.toFixed(1)}</strong>
              <small>
                {v.workouts ? plural(v.workouts, "workout") : "No workouts"}
                {other ? ` · ${rows[i].site}` : ""}
              </small>
            </li>
          )),
        )}
      </ul>
    </section>
  );
}
