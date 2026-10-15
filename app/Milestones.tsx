"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  dataCSV,
  normalizeDataName,
  type ExplorerData,
} from "../lib/dataExplorer";
import {
  addDataDays,
  buildMilestones,
  milestoneWeeks,
  mondayOf,
  type MilestoneStep,
  type MilestoneTier,
} from "../lib/milestones";
import DataInsightsFrame, { insightDate } from "./DataInsightsFrame";
import common from "./DataExplorer.module.css";
import styles from "./DataInsights.module.css";

type Mode = "forecast" | "reached" | "unprojected";
function readOptions() {
  const p = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  );
  return {
    search: (p.get("search") ?? "").slice(0, 200),
    step: [100, 500, 1000].includes(Number(p.get("step")))
      ? (Number(p.get("step")) as MilestoneStep)
      : 100,
    horizon: ["30", "90", "180", "all"].includes(p.get("horizon") ?? "")
      ? p.get("horizon")!
      : "90",
    mode: ["forecast", "reached", "unprojected"].includes(p.get("mode") ?? "")
      ? (p.get("mode") as Mode)
      : "forecast",
    region: ["bedrock", "other", "unknown"].includes(p.get("region") ?? "")
      ? p.get("region")!
      : "",
  };
}
function Tier({ target, tier }: { target: number; tier: MilestoneTier }) {
  return (
    <span
      className={`${styles.milestoneBadge} ${tier === "thousand" ? styles.thousand : tier === "five-hundred" ? styles.fiveHundred : ""}`}
    >
      {target.toLocaleString()} <span>posts</span>
    </span>
  );
}
function profileURL(name: string) {
  return "/data?" + new URLSearchParams({ period: "all", pax: name });
}
function exportMilestones(
  headers: string[],
  rows: (string | number | null)[][],
  mode: Mode,
) {
  const url = URL.createObjectURL(
    new Blob([dataCSV(headers, rows)], { type: "text/csv;charset=utf-8;" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `bedrock-milestones-${mode}.csv`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function Milestones() {
  return (
    <DataInsightsFrame
      page="milestones"
      title="Milestones"
      description="Every hundred, with 500s and 1,000s highlighted."
    >
      {(data) => <MilestoneContent data={data} />}
    </DataInsightsFrame>
  );
}
function MilestoneContent({ data }: { data: ExplorerData }) {
  const [options, setOptions] = useState(readOptions),
    [sort, setSort] = useState("soonest"),
    [week, setWeek] = useState(""),
    [page, setPage] = useState(0);
  const { search, step, horizon, mode, region } = options;
  const update = (patch: Partial<typeof options>) => {
    setOptions((o) => ({ ...o, ...patch }));
    setWeek("");
    setPage(0);
  };
  useEffect(() => {
    const params = new URLSearchParams({ mode, step: String(step), horizon });
    if (search) params.set("search", search);
    if (region) params.set("region", region);
    window.history.replaceState(null, "", "/data/milestones?" + params);
  }, [search, step, horizon, mode, region]);
  useEffect(() => {
    const pop = () => {
      setOptions(readOptions());
      setWeek("");
      setPage(0);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  const result = useMemo(() => buildMilestones(data, step), [data, step]);
  const matches = (person: { name: string; region: string }) =>
    normalizeDataName(person.name).includes(normalizeDataName(search)) &&
    (!region ||
      (region === "bedrock"
        ? person.region.toLowerCase() === "bedrock"
        : region === "unknown"
          ? !person.region
          : !!person.region && person.region.toLowerCase() !== "bedrock"));
  const available = result.forecasts.filter(matches);
  const days = horizon === "all" ? 90 : Number(horizon);
  const last = addDataDays(data.asOf, days),
    first = addDataDays(data.asOf, -(days - 1));
  const forecasts = available
    .filter((f) =>
      mode === "unprojected"
        ? !f.projected
        : f.projected && (horizon === "all" || f.projected <= last),
    )
    .filter((f) => !week || (f.projected && mondayOf(f.projected) === week));
  forecasts.sort((a, b) =>
    sort === "remaining"
      ? a.remaining - b.remaining ||
        (a.projected ?? "9999").localeCompare(b.projected ?? "9999") ||
        a.name.localeCompare(b.name)
      : (a.projected ?? "9999").localeCompare(b.projected ?? "9999") ||
        a.remaining - b.remaining ||
        a.name.localeCompare(b.name),
  );
  const reached = result.reached
    .filter(matches)
    .filter((r) => horizon === "all" || r.date >= first);
  const weekly = milestoneWeeks(available, data.asOf, Math.min(days, 90));
  const highest = Math.max(1, ...weekly.map((w) => w.total));
  const count = mode === "reached" ? reached.length : forecasts.length,
    pages = Math.max(1, Math.ceil(count / 25)),
    currentPage = Math.min(page, pages - 1);
  const unprojectedCount = available.filter((f) => !f.projected).length;
  const download = () =>
    mode === "reached"
      ? exportMilestones(
          ["PAX", "Milestone", "Reached", "Region"],
          reached.map((r) => [r.name, r.target, r.date, r.region]),
          mode,
        )
      : exportMilestones(
          [
            "PAX",
            "Recorded posts",
            "Milestone",
            "Posts to go",
            "Projected date",
            "Earlier pace estimate",
            "Later pace estimate",
            "Posts per week (90-day pace)",
            "Last post",
            "No estimate reason",
            "Region",
          ],
          forecasts.map((f) => [
            f.name,
            f.posts,
            f.target,
            f.remaining,
            f.projected,
            f.earliest,
            f.latest,
            Number(f.postsPerWeek.toFixed(2)),
            f.lastPost,
            f.reason,
            f.region,
          ]),
          mode,
        );
  return (
    <>
      <div
        className={styles.modeTabs}
        role="group"
        aria-label="Milestone views"
      >
        {(
          [
            ["forecast", "Forecasts"],
            ["reached", "Recently reached"],
            ["unprojected", "No estimate"],
          ] as const
        ).map(([value, label]) => (
          <button
            aria-pressed={mode === value}
            key={value}
            onClick={() => update({ mode: value })}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={`${styles.controls} ${styles.milestoneControls}`}>
        <label className={styles.searchLabel}>
          Search PAX
          <input
            type="search"
            value={search}
            placeholder="Find an F3 name…"
            onChange={(e) => update({ search: e.target.value })}
          />
        </label>
        {mode !== "unprojected" && (
          <label>
            {mode === "reached" ? "Reached within" : "Expected within"}
            <select
              aria-label="Milestone time window"
              value={horizon}
              onChange={(e) => update({ horizon: e.target.value })}
            >
              <option value="30">
                {mode === "reached" ? "Last" : "Next"} 30 days
              </option>
              <option value="90">
                {mode === "reached" ? "Last" : "Next"} 90 days
              </option>
              <option value="180">
                {mode === "reached" ? "Last" : "Next"} 180 days
              </option>
              <option value="all">All recorded / projected</option>
            </select>
          </label>
        )}
        <details className={styles.moreControls}>
          <summary>More options{region ? " · region filtered" : ""}</summary>
          <div>
            <label>
              Milestones
              <select
                aria-label="Milestone interval"
                value={step}
                onChange={(e) =>
                  update({ step: Number(e.target.value) as MilestoneStep })
                }
              >
                <option value={100}>Every 100 posts</option>
                <option value={500}>500s only</option>
                <option value={1000}>1,000s only</option>
              </select>
            </label>
            <label>
              Roster region
              <select
                aria-label="Milestone Roster region"
                value={region}
                onChange={(e) => update({ region: e.target.value })}
              >
                <option value="">All PAX</option>
                <option value="bedrock">Bedrock</option>
                <option value="other">Other recorded regions</option>
                <option value="unknown">Not recorded</option>
              </select>
            </label>
            {mode !== "reached" && (
              <label>
                Sort
                <select
                  aria-label="Milestone sort"
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="soonest">Soonest expected</option>
                  <option value="remaining">Fewest posts to go</option>
                </select>
              </label>
            )}
            <button onClick={download} disabled={!count}>
              Export CSV
            </button>
          </div>
        </details>
      </div>

      <div className={styles.resultHeading}>
        <p aria-live="polite">
          <strong>{count}</strong>{" "}
          {mode === "reached"
            ? "milestones reached"
            : mode === "unprojected"
              ? "PAX without an estimate"
              : count === 1
                ? "upcoming milestone"
                : "upcoming milestones"}
          {week && (
            <>
              {" "}
              · week of {insightDate(week)}{" "}
              <button className={styles.textButton} onClick={() => setWeek("")}>
                Clear week
              </button>
            </>
          )}
        </p>
      </div>

      {count === 0 ? (
        <div className={common.empty}>
          <h2>
            {mode === "reached"
              ? "No milestones in this period"
              : mode === "unprojected"
                ? "Everyone in this search has an estimate"
                : "No milestones in this forecast window"}
          </h2>
          <p>Try another name, a wider window, or every 100 posts.</p>
          <button
            onClick={() =>
              update({ search: "", step: 100, horizon: "all", region: "" })
            }
          >
            Show all milestones in this view
          </button>
        </div>
      ) : (
        <>
          <div
            className={`${common.tableScroll} ${styles.desktopResults}`}
            role="region"
            tabIndex={0}
            aria-label="Milestone results"
          >
            <table className={common.table}>
              <caption className={common.srOnly}>
                {mode === "reached"
                  ? "Reached milestones"
                  : "Milestone forecasts"}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={common.pinned}>
                    PAX
                  </th>
                  <th scope="col">Milestone</th>
                  {mode === "reached" ? (
                    <th scope="col">Reached</th>
                  ) : (
                    <>
                      <th scope="col">Recorded posts</th>
                      <th scope="col">To go</th>
                      <th scope="col">
                        {mode === "unprojected"
                          ? "Why no estimate?"
                          : "Expected week"}
                      </th>
                      <th scope="col">Recent pace</th>
                      <th scope="col">Last post</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {mode === "reached"
                  ? reached
                      .slice(currentPage * 25, (currentPage + 1) * 25)
                      .map((r) => (
                        <tr key={`${r.name}-${r.target}`}>
                          <td className={common.pinned}>
                            <Link
                              className={styles.nameLink}
                              href={profileURL(r.name)}
                            >
                              {r.name}
                            </Link>
                          </td>
                          <td>
                            <Tier target={r.target} tier={r.tier} />
                          </td>
                          <td>{insightDate(r.date, true)}</td>
                        </tr>
                      ))
                  : forecasts
                      .slice(currentPage * 25, (currentPage + 1) * 25)
                      .map((f) => (
                        <tr key={f.name}>
                          <td className={common.pinned}>
                            <Link
                              className={styles.nameLink}
                              href={profileURL(f.name)}
                            >
                              {f.name}
                            </Link>
                          </td>
                          <td>
                            <Tier target={f.target} tier={f.tier} />
                          </td>
                          <td>{f.posts.toLocaleString()}</td>
                          <td className={styles.toGo}>{f.remaining}</td>
                          <td className={styles.estimateCell}>
                            {f.projected ? (
                              <>
                                <strong>
                                  Week of{" "}
                                  {insightDate(mondayOf(f.projected), true)}
                                </strong>
                                <small>
                                  30/90-day pace range:{" "}
                                  {insightDate(f.earliest!, true)} –{" "}
                                  {insightDate(f.latest!, true)}
                                </small>
                              </>
                            ) : (
                              <span>{f.reason}</span>
                            )}
                          </td>
                          <td>
                            {f.postsPerWeek.toFixed(1)} / week
                            <small className={styles.cellNote}>
                              {f.recentPosts} posts / 90 days*
                            </small>
                          </td>
                          <td>{insightDate(f.lastPost, true)}</td>
                        </tr>
                      ))}
              </tbody>
            </table>
          </div>
          <ol
            className={styles.mobileResults}
            aria-label="Milestone results on phones"
          >
            {mode === "reached"
              ? reached
                  .slice(currentPage * 25, (currentPage + 1) * 25)
                  .map((r) => (
                    <li key={`${r.name}-${r.target}`}>
                      <div className={styles.mobileMilestoneHeading}>
                        <Link
                          className={styles.nameLink}
                          href={profileURL(r.name)}
                        >
                          {r.name}
                        </Link>
                        <Tier target={r.target} tier={r.tier} />
                      </div>
                      <p className={styles.mobileExpected}>
                        Reached {insightDate(r.date, true)}
                      </p>
                    </li>
                  ))
              : forecasts
                  .slice(currentPage * 25, (currentPage + 1) * 25)
                  .map((f) => (
                    <li key={f.name}>
                      <div className={styles.mobileMilestoneHeading}>
                        <Link
                          className={styles.nameLink}
                          href={profileURL(f.name)}
                        >
                          {f.name}
                        </Link>
                        <Tier target={f.target} tier={f.tier} />
                      </div>
                      <p className={styles.mobilePostCount}>
                        {f.posts.toLocaleString()} posts ·{" "}
                        <strong>{f.remaining} to go</strong> ·{" "}
                        {f.postsPerWeek.toFixed(1)} / week
                      </p>
                      <p className={styles.mobileExpected}>
                        {f.projected
                          ? `Expected week of ${insightDate(mondayOf(f.projected), true)}`
                          : f.reason}
                      </p>
                      <p className={styles.mobileRange}>
                        {f.projected
                          ? `Pace range: ${insightDate(f.earliest!, true)} – ${insightDate(f.latest!, true)}`
                          : `Last recorded post ${insightDate(f.lastPost, true)}`}
                      </p>
                    </li>
                  ))}
          </ol>
          <div className={styles.pager}>
            <span>
              {currentPage * 25 + 1}–{Math.min((currentPage + 1) * 25, count)}{" "}
              of {count}
            </span>
            <button
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </button>
            <button
              disabled={currentPage === pages - 1}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
      {mode === "forecast" && unprojectedCount > 0 && (
        <button
          className={styles.textButton}
          onClick={() => update({ mode: "unprojected" })}
        >
          {unprojectedCount} PAX have no estimate from recent attendance
        </button>
      )}
      {mode === "forecast" && (
        <details className={styles.forecastDisclosure}>
          <summary>
            View the next {Math.min(days, 90)} days on a timeline
          </summary>
          <section
            className={styles.forecastTimeline}
            aria-labelledby="milestone-timeline-heading"
          >
            <div className={styles.chartTitle}>
              <h2 id="milestone-timeline-heading">
                Coming up over {Math.min(days, 90)} days
              </h2>
              <p>Estimated milestone weeks · select a bar to filter</p>
            </div>
            <div className={styles.forecastBars}>
              {weekly.map((bucket, index) => (
                <button
                  key={bucket.week}
                  className={week === bucket.week ? styles.selectedWeek : ""}
                  disabled={!bucket.total}
                  onClick={() => {
                    setWeek((w) => (w === bucket.week ? "" : bucket.week));
                    setPage(0);
                  }}
                  aria-pressed={week === bucket.week}
                  aria-label={`Week of ${insightDate(bucket.week, true)}: ${bucket.total} projected milestones, ${bucket.fiveHundreds} at 500s, ${bucket.thousands} at 1,000s`}
                  title={`Week of ${insightDate(bucket.week)}: ${bucket.total} milestones`}
                >
                  <span className={styles.barCount}>{bucket.total || ""}</span>
                  <span className={styles.barTrack}>
                    <span
                      className={`${styles.barFill} ${bucket.thousands ? styles.thousandBar : bucket.fiveHundreds ? styles.fiveHundredBar : ""}`}
                      style={{ height: `${(bucket.total / highest) * 100}%` }}
                    />
                  </span>
                  <span className={styles.barLabel}>
                    {index % 3 === 0 ? insightDate(bucket.week) : ""}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </details>
      )}
      <details className={common.definitions}>
        <summary>How milestone forecasts work</summary>
        <p>
          Every row marked Post = 1 counts as a workout post. Multiple posts on
          one date count separately. Qsource alone does not add a workout post.
          Totals cover the attendance loaded from this sheet, including prior
          years; they are not a claim about posts at other regions.
        </p>
        <p>
          The next milestone is the next multiple of 100, 500, or 1,000.
          Reaching 100 moves the next 100-post milestone to 200. Recently
          reached milestones come from actual recorded attendance dates.
        </p>
        <p>
          Forecasts use posts per calendar day over the last 90 days, starting
          at the first recorded post for newer PAX. The date range compares
          30-day and 90-day attendance rates. It shows how two pace estimates
          differ, not a statistical confidence interval. Future schedules,
          holidays, and attendance changes are not predicted.
        </p>
        <p>
          We leave the date blank with fewer than 4 posts in 90 days, less than
          14 days of recorded history, or no post in the last 30 days. *For
          newer PAX, the pace denominator is the shorter recorded history. Both
          forecasts and recent periods are anchored to{" "}
          {insightDate(data.asOf, true)}, the latest attendance date. Sheet
          changes may take up to 10 minutes to appear.
        </p>
      </details>
    </>
  );
}
