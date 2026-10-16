"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useExplorerData } from "../lib/useExplorerData";
import { nextPostMilestone } from "../lib/milestones";
import DataSectionNav from "./DataSectionNav";
import {
  companions,
  dataCSV,
  dataFilterParams,
  daysBetween,
  defaultDataFilters,
  filterDataRows,
  normalizeDataName,
  readDataFilters,
  summarizePax,
  type DataFilters,
  type DataRow,
  type DataView,
  type ExplorerData,
  type PaxStats,
} from "../lib/dataExplorer";
import styles from "./DataExplorer.module.css";

const VIEWS: { value: DataView; label: string }[] = [
  { value: "pax", label: "PAX" },
  { value: "qsource", label: "Qsource" },
  { value: "kotter", label: "Kotter" },
  { value: "qkotter", label: "Q Kotter" },
  { value: "aos", label: "Monthly AOs" },
  { value: "raw", label: "Raw attendance" },
];
const FLAGS = [
  ["post", "Post"],
  ["q", "Q"],
  ["fng", "FNG"],
  ["qs", "QS"],
  ["qsq", "QS-Q"],
] as const;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const formatDate = (date: string) =>
  date
    ? new Date(date + "T00:00:00Z").toLocaleDateString("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
const number = (n: number) => n.toLocaleString("en-US");
function Icon({ kind }: { kind: "download" | "link" | "arrow" | "search" }) {
  const paths = {
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5" />
        <path d="M5 16v4h14v-4" />
      </>
    ),
    link: (
      <>
        <path d="m10 13 4-4m-6 7-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" />
      </>
    ),
    arrow: <path d="m12 5-7 7 7 7M5 12h15" />,
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[kind]}
    </svg>
  );
}
function downloadCSV(
  filename: string,
  headers: string[],
  rows: (string | number | boolean | null)[][],
) {
  const url = URL.createObjectURL(
    new Blob([dataCSV(headers, rows)], { type: "text/csv;charset=utf-8;" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const RAW_COLUMNS: { key: keyof DataRow; label: string }[] = [
  { key: "pax", label: "PAX" },
  { key: "date", label: "Date" },
  { key: "site", label: "AO" },
  { key: "city", label: "City" },
  ...FLAGS.map(([key, label]) => ({ key, label })),
];
type Column = {
  key: keyof PaxStats;
  label: string;
  format?: "date" | "percent";
};
const baseColumns: Column[] = [
  { key: "name", label: "PAX" },
  { key: "posts", label: "Posts" },
  { key: "qs", label: "Qs" },
];
function statColumns(view: DataView): Column[] {
  if (view === "qsource")
    return [
      { key: "name", label: "PAX" },
      { key: "posts", label: "QS posts" },
      { key: "qs", label: "QS Qs" },
    ];
  if (view === "kotter")
    return [
      ...baseColumns,
      { key: "last", label: "Last post", format: "date" },
      { key: "days", label: "Days since" },
    ];
  if (view === "qkotter")
    return [
      ...baseColumns,
      { key: "lastQ", label: "Last Q", format: "date" },
      { key: "last", label: "Last post", format: "date" },
      { key: "days", label: "Days since Q" },
    ];
  if (view === "aos")
    return [
      baseColumns[0],
      baseColumns[1],
      { key: "aos", label: "Active AOs" },
      { key: "aoPercent", label: "AO coverage", format: "percent" },
    ];
  return [
    ...baseColumns,
    { key: "first", label: "First in view", format: "date" },
    { key: "attendance", label: "Post %", format: "percent" },
    { key: "streak", label: "Best streak" },
    { key: "qRatio", label: "Q ratio", format: "percent" },
  ];
}

export default function DataExplorer() {
  const query = useExplorerData();
  return (
    <section className={styles.shell} aria-label="Attendance data explorer">
      {query.isPending ? (
        <div className={styles.loading} role="status">
          <span className={styles.spinner} />
          Loading Bedrock attendance…
        </div>
      ) : !query.data ? (
        <div className={styles.empty} role="alert">
          <h1>Attendance is unavailable</h1>
          <p>We couldn’t read the spreadsheet. Try loading it again.</p>
          <button onClick={() => query.refetch()}>Try again</button>
        </div>
      ) : (
        <Explorer
          data={query.data}
          refreshing={query.isFetching}
          refresh={() => {
            void query.refetch();
          }}
          refreshError={query.isRefetchError}
        />
      )}
    </section>
  );
}
function Explorer({
  data,
  refreshing,
  refresh,
  refreshError,
}: {
  data: ExplorerData;
  refreshing: boolean;
  refresh: () => void;
  refreshError: boolean;
}) {
  const [filters, setFilters] = useState(() =>
    readDataFilters(
      new URLSearchParams(
        typeof window === "undefined" ? "" : window.location.search,
      ),
      data.asOf,
    ),
  );
  const [selected, setSelected] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("pax") ?? ""),
  );
  const contentRef = useRef<HTMLDivElement>(null);
  const resultsScroll = useRef(0);
  const [extraFiltersOpen, setExtraFiltersOpen] = useState(() =>
    Boolean(filters.site || filters.region || filters.flags.length),
  );
  const openPerson = (name: string) => {
    resultsScroll.current = contentRef.current?.parentElement?.scrollTop ?? 0;
    setSelected(name);
  };
  useEffect(() => {
    const section = contentRef.current?.parentElement;
    if (section) section.scrollTop = selected ? 0 : resultsScroll.current;
    if (selected)
      contentRef.current
        ?.querySelector<HTMLElement>("[data-pax-heading]")
        ?.focus({ preventScroll: true });
  }, [selected]);
  const [sort, setSort] = useState<{ key: string; asc: boolean }>({
    key:
      filters.view === "raw"
        ? "date"
        : filters.view === "aos"
          ? "aos"
          : filters.view.includes("kotter")
            ? "days"
            : "posts",
    asc: filters.view.includes("kotter"),
  });
  const [page, setPage] = useState(0),
    [pageSize, setPageSize] = useState(25);
  const [shareMessage, setShareMessage] = useState(""),
    [shareFallback, setShareFallback] = useState("");
  useEffect(() => {
    const params = dataFilterParams(filters);
    if (window.location.pathname === "/") params.set("tab", "data");
    if (selected) params.set("pax", selected);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params}`,
    );
  }, [filters, selected]);
  useEffect(() => {
    const pop = () => {
      const params = new URLSearchParams(window.location.search);
      setFilters(readDataFilters(params, data.asOf));
      setSelected(params.get("pax") ?? "");
      setPage(0);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [data.asOf]);
  const update = (patch: Partial<DataFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(0);
    setShareMessage("");
    setShareFallback("");
  };
  const switchView = (view: DataView) => {
    update({
      view,
      ...(view === "aos"
        ? { period: "month" as const }
        : view.includes("kotter")
          ? { period: "all" as const }
          : {}),
    });
    setSort({
      key:
        view === "raw"
          ? "date"
          : view === "aos"
            ? "aos"
            : view.includes("kotter")
              ? "days"
              : "posts",
      asc: view.includes("kotter"),
    });
  };
  const raw = useMemo(() => filterDataRows(data, filters), [data, filters]);
  const stats = useMemo(() => summarizePax(data, filters), [data, filters]);
  const isRaw = filters.view === "raw";
  const columns = isRaw ? RAW_COLUMNS : statColumns(filters.view);
  const sortKey = columns.some((c) => c.key === sort.key)
    ? sort.key
    : isRaw
      ? "date"
      : "posts";
  const sorted = useMemo(() => {
    const rows: (PaxStats | DataRow)[] = isRaw ? raw : stats;
    return [...rows].sort((a, b) => {
      const av = a[sortKey as keyof typeof a] as string | number | boolean,
        bv = b[sortKey as keyof typeof b] as string | number | boolean;
      const diff =
        typeof av === "string" && typeof bv === "string"
          ? av.localeCompare(bv)
          : Number(av) - Number(bv);
      return (
        (sort.asc ? diff : -diff) ||
        ("name" in a ? a.name : a.pax).localeCompare(
          "name" in b ? b.name : b.pax,
        )
      );
    });
  }, [isRaw, raw, stats, sortKey, sort.asc]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize)),
    currentPage = Math.min(page, pages - 1);
  const years = [...new Set(data.rows.map((row) => row.date.slice(0, 4)))]
    .sort()
    .reverse();
  if (!years.includes(filters.year)) years.push(filters.year);
  const sites = [
    ...new Set([
      ...data.sites.map((s) => s.name),
      ...data.rows.map((r) => r.site),
    ]),
  ]
    .filter(Boolean)
    .sort();
  const invalidDates =
    filters.period === "custom" &&
    !!filters.from &&
    !!filters.to &&
    filters.from > filters.to;
  const exportRows = () =>
    downloadCSV(
      `bedrock-${filters.view}-${data.asOf}.csv`,
      columns.map((c) => c.label),
      sorted.map((row) =>
        columns.map(
          (c) => row[c.key as keyof typeof row] as string | number | boolean,
        ),
      ),
    );
  const share = async () => {
    const params = dataFilterParams(filters);
    if (selected) params.set("pax", selected);
    const url = `${window.location.origin}/data?${params}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareMessage("Link copied");
    } catch {
      setShareFallback(url);
      setShareMessage("Copy the link below");
    }
  };
  const selectedExists = data.rows.some(
    (row) => normalizeDataName(row.pax) === normalizeDataName(selected),
  );
  return (
    <div ref={contentRef} className={styles.content}>
      <div className={styles.heading}>
        <div>
          <DataSectionNav active="attendance" />
          <h1>Bedrock data</h1>
        </div>
        <div className={styles.actions}>
          <button onClick={share}>
            <Icon kind="link" />
            Share view
          </button>
          <button disabled={!sorted.length || !!selected} onClick={exportRows}>
            <Icon kind="download" />
            Export CSV
          </button>
        </div>
      </div>
      <div className={styles.freshness}>
        <span>
          Attendance through <strong>{formatDate(data.asOf)}</strong>
        </span>
        <button disabled={refreshing} onClick={refresh}>
          {refreshing ? "Loading…" : "Reload data"}
        </button>
        <span className={styles.cacheNote}>
          Sheet changes may take up to 10 minutes to appear.
        </span>
      </div>
      {refreshError && (
        <p role="alert" className={styles.notice}>
          Reload failed. Showing the last loaded data. Try reloading again.
        </p>
      )}
      {shareMessage && (
        <p role="status" className={styles.notice}>
          {shareMessage}
        </p>
      )}
      {shareFallback && (
        <input
          aria-label="Shareable view URL"
          className={styles.shareInput}
          readOnly
          value={shareFallback}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
      {selected ? (
        selectedExists ? (
          <PaxDetail
            key={normalizeDataName(selected)}
            data={data}
            name={selected}
            close={() => setSelected("")}
          />
        ) : (
          <div className={styles.empty}>
            <h2>PAX not found</h2>
            <p>This name has no public attendance records.</p>
            <button onClick={() => setSelected("")}>Back to data</button>
          </div>
        )
      ) : (
        <>
          <nav className={styles.views} aria-label="Data views">
            {VIEWS.map((view) => (
              <button
                key={view.value}
                aria-pressed={filters.view === view.value}
                onClick={() => switchView(view.value)}
              >
                {view.label}
              </button>
            ))}
          </nav>
          <div className={styles.filters}>
            <label className={styles.search}>
              Search PAX
              <div className={styles.searchBox}>
                <Icon kind="search" />
                <input
                  type="search"
                  placeholder="Find an F3 name…"
                  value={filters.search}
                  onChange={(e) => update({ search: e.target.value })}
                />
              </div>
            </label>
            <label>
              Period
              <select
                aria-label="Period"
                value={filters.period}
                onChange={(e) =>
                  update({ period: e.target.value as DataFilters["period"] })
                }
              >
                <option value="year">Year</option>
                <option value="month">Month</option>
                <option value="all">All time</option>
                <option value="custom">Custom dates</option>
              </select>
            </label>
            {(filters.period === "year" || filters.period === "month") && (
              <label>
                Year
                <select
                  aria-label="Year"
                  value={filters.year}
                  onChange={(e) => update({ year: e.target.value })}
                >
                  {years.map((year) => (
                    <option key={year}>{year}</option>
                  ))}
                </select>
              </label>
            )}
            {filters.period === "month" && (
              <label>
                Month
                <select
                  aria-label="Month"
                  value={filters.month}
                  onChange={(e) => update({ month: e.target.value })}
                >
                  {MONTHS.map((month, i) => (
                    <option key={month} value={String(i + 1).padStart(2, "0")}>
                      {month}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {filters.period === "custom" && (
              <>
                <label>
                  From
                  <input
                    aria-invalid={invalidDates}
                    type="date"
                    value={filters.from}
                    onChange={(e) => update({ from: e.target.value })}
                  />
                </label>
                <label>
                  Through
                  <input
                    aria-invalid={invalidDates}
                    type="date"
                    value={filters.to}
                    onChange={(e) => update({ to: e.target.value })}
                  />
                </label>
              </>
            )}
          </div>
          <div className={styles.filterExtras}>
            <details
              open={extraFiltersOpen}
              onToggle={(e) => setExtraFiltersOpen(e.currentTarget.open)}
            >
              <summary>
                More filters · AO, region &amp; flags
                {[filters.site, filters.region, ...filters.flags].filter(
                  Boolean,
                ).length
                  ? ` · ${[filters.site, filters.region, ...filters.flags].filter(Boolean).length} active`
                  : ""}
              </summary>
              <div className={styles.aoRegionOptions}>
                <label>
                  AO
                  <select
                    aria-label="AO"
                    value={filters.site}
                    onChange={(e) => update({ site: e.target.value })}
                  >
                    <option value="">All AOs</option>
                    {sites.map((site) => (
                      <option key={site}>{site}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Roster region
                  <select
                    aria-label="Roster region"
                    value={filters.region}
                    onChange={(e) => update({ region: e.target.value })}
                  >
                    <option value="">All PAX</option>
                    <option value="bedrock">Bedrock</option>
                    <option value="other">Other recorded regions</option>
                  </select>
                </label>
              </div>
              <fieldset>
                <legend>Every selected flag must match the same row.</legend>
                {FLAGS.map(([key, label]) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={filters.flags.includes(key)}
                      onChange={() =>
                        update({
                          flags: filters.flags.includes(key)
                            ? filters.flags.filter((f) => f !== key)
                            : [...filters.flags, key],
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
            </details>
            <button
              onClick={() => {
                setExtraFiltersOpen(false);
                setFilters(defaultDataFilters(data.asOf));
                setSort({ key: "posts", asc: false });
                setPage(0);
              }}
            >
              Reset filters
            </button>
          </div>
          {invalidDates && (
            <p role="alert" className={styles.notice}>
              Choose a start date on or before the end date.
            </p>
          )}
          <div className={styles.resultBar} aria-live="polite">
            <p>
              <strong>{number(sorted.length)}</strong>{" "}
              {isRaw ? "attendance rows" : "PAX"}
              {!isRaw && (
                <>
                  {" "}
                  ·{" "}
                  <strong>
                    {number(stats.reduce((sum, p) => sum + p.posts, 0))}
                  </strong>{" "}
                  {filters.view === "qsource" ? "Qsource posts" : "posts"}
                </>
              )}
            </p>
            <span>
              {filters.view === "raw"
                ? "Flags reflect the sheet"
                : "Select a name for all-time attendance"}
            </span>
          </div>
          {filters.view === "kotter" && (
            <p className={styles.viewNote}>
              Bedrock PAX, excluding 2.0s, whose last recorded post was more
              than 14 and fewer than 365 days before {formatDate(data.asOf)}.
              Counts follow your filters.
            </p>
          )}
          {filters.view === "qkotter" && (
            <p className={styles.viewNote}>
              Bedrock PAX whose last recorded Q was more than 30 and fewer than
              365 days before {formatDate(data.asOf)}. PAX with no recorded Q
              are excluded. Counts follow your filters.
            </p>
          )}
          {filters.view === "aos" && (
            <p className={styles.viewNote}>
              Coverage counts currently active AOs listed on the Sites tab
              {filters.site ? `, limited to ${filters.site}` : ""}. Retired and
              other locations still contribute to posts.
            </p>
          )}
          {sorted.length ? (
            <>
              <div
                className={styles.tableScroll}
                tabIndex={0}
                role="region"
                aria-label="Scrollable attendance results"
              >
                <table className={styles.table}>
                  <caption className={styles.srOnly}>
                    {VIEWS.find((v) => v.value === filters.view)?.label}{" "}
                    results. Select column headings to sort.
                  </caption>
                  <thead>
                    <tr>
                      {columns.map((column, i) => (
                        <th
                          key={column.key}
                          scope="col"
                          className={i === 0 ? styles.pinned : ""}
                          aria-sort={
                            sortKey === column.key
                              ? sort.asc
                                ? "ascending"
                                : "descending"
                              : "none"
                          }
                        >
                          <button
                            onClick={() => {
                              setSort({
                                key: column.key,
                                asc:
                                  sortKey === column.key ? !sort.asc : i === 0,
                              });
                              setPage(0);
                            }}
                          >
                            {column.label}
                            <span
                              aria-hidden="true"
                              className={styles.sortMark}
                            >
                              {sortKey === column.key
                                ? sort.asc
                                  ? "↑"
                                  : "↓"
                                : "↕"}
                            </span>
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted
                      .slice(
                        currentPage * pageSize,
                        (currentPage + 1) * pageSize,
                      )
                      .map((row, index) => (
                        <tr
                          key={
                            "name" in row ? row.name : `${currentPage}-${index}`
                          }
                        >
                          {columns.map((column, i) => {
                            const value = row[
                              column.key as keyof typeof row
                            ] as string | number | boolean;
                            const format =
                              "format" in column ? column.format : undefined;
                            return (
                              <td
                                key={column.key}
                                className={i === 0 ? styles.pinned : ""}
                              >
                                {i === 0 ? (
                                  <button
                                    className={styles.personLink}
                                    onClick={() => openPerson(String(value))}
                                  >
                                    <span className={styles.personName}>{String(value)}</span>
                                    <span aria-hidden="true">›</span>
                                  </button>
                                ) : typeof value === "boolean" ? (
                                  <span
                                    className={
                                      value ? styles.flagYes : styles.flagNo
                                    }
                                  >
                                    {value ? "1" : "0"}
                                  </span>
                                ) : format === "date" ? (
                                  formatDate(String(value))
                                ) : format === "percent" ? (
                                  `${Number(value).toFixed(1)}%`
                                ) : typeof value === "number" ? (
                                  number(value)
                                ) : (
                                  value || "—"
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <div className={styles.pagination}>
                <label>
                  Rows
                  <select
                    aria-label="Rows per page"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(+e.target.value);
                      setPage(0);
                    }}
                  >
                    {[25, 50, 100].map((size) => (
                      <option key={size}>{size}</option>
                    ))}
                  </select>
                </label>
                <span>
                  {number(currentPage * pageSize + 1)}–
                  {number(
                    Math.min((currentPage + 1) * pageSize, sorted.length),
                  )}{" "}
                  of {number(sorted.length)}
                </span>
                <div>
                  <button
                    aria-label="Previous page"
                    disabled={currentPage === 0}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    Previous
                  </button>
                  <button
                    aria-label="Next page"
                    disabled={currentPage === pages - 1}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className={styles.empty}>
              <h2>No matching {isRaw ? "attendance" : "PAX"}</h2>
              <p>Try a wider date range, another AO, or fewer flags.</p>
              <button
                onClick={() =>
                  update({
                    search: "",
                    site: "",
                    region: "",
                    flags: [],
                    period: "all",
                  })
                }
              >
                Show all data in this view
              </button>
            </div>
          )}
          <details className={styles.definitions}>
            <summary>How these numbers work</summary>
            <p>
              Posts count rows marked Post = 1. Qsource counts QS = 1 and
              leadership uses QS-Q. Two posts on one day count as two posts.
            </p>
            <p>
              Post % is distinct days attended ÷ recorded workout days in the
              selected period and AO. For all time, the denominator starts at
              that PAX’s first recorded post. Search, region, and flags don’t
              shrink the denominator. Best streak is consecutive recorded
              workout days attended; days with no recorded workouts don’t break
              it. Q ratio is Qs ÷ posts.
            </p>
            <p>
              “First in view” is the earliest post matching your filters, not
              necessarily the PAX’s FNG date. Raw FNG flags come directly from
              attendance; EH Challenge eligibility also requires Bedrock in the
              Roster. Filters combine, and CSV exports include all matching rows
              in the selected sort order. Numeric percentages in CSV are on a
              0–100 scale.
            </p>
            <p>
              Archived names and entries marked (&lt;18) are excluded. Roster
              contact and intake fields are never included.
            </p>
            <p>
              Reference:{" "}
              <a
                href="https://github.com/kevin-jones-cbs/f3-data-tools-frontend"
                target="_blank"
                rel="noreferrer"
              >
                F3 Data Tools
              </a>
              .
            </p>
          </details>
        </>
      )}
    </div>
  );
}

function PaxDetail({
  data,
  name,
  close,
}: {
  data: ExplorerData;
  name: string;
  close: () => void;
}) {
  const key = normalizeDataName(name);
  const rows = useMemo(
    () =>
      data.rows
        .filter((row) => normalizeDataName(row.pax) === key)
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) || a.site.localeCompare(b.site),
        ),
    [data, key],
  );
  const posts = rows.filter((row) => row.post),
    qs = rows.filter((row) => row.qs);
  const person = data.people.find((p) => normalizeDataName(p.name) === key);
  const displayName = person?.name ?? rows[0]?.pax ?? name;
  const profile = useMemo(
    () =>
      summarizePax(data, {
        ...defaultDataFilters(data.asOf),
        period: "all",
        search: displayName,
      }).find((p) => normalizeDataName(p.name) === key),
    [data, displayName, key],
  );
  const [month, setMonth] = useState(
    (rows.at(-1)?.date ?? data.asOf).slice(0, 7),
  );
  const [relation, setRelation] = useState<"with" | "by" | "led">("with"),
    [range, setRange] = useState("all");
  const start =
    range === "recent"
      ? Math.max(0, posts.length - 100)
      : range === "all"
        ? 0
        : Number(range);
  const peers = useMemo(
    () =>
      companions(
        data,
        displayName,
        relation,
        start,
        range === "all" ? undefined : 100,
      ),
    [data, displayName, relation, start, range],
  );
  const calendarRows = rows.filter((row) => row.date.startsWith(month));
  const [yearNum, monthNum] = month.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(yearNum, monthNum - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(yearNum, monthNum, 0)).getUTCDate();
  const locations = [...new Set(posts.map((row) => row.site))]
    .map((site) => ({
      site,
      count: posts.filter((row) => row.site === site).length,
    }))
    .sort((a, b) => b.count - a.count || a.site.localeCompare(b.site));
  const allWorkoutDates = [
    ...new Set(data.rows.filter((r) => r.post).map((r) => r.date)),
  ].sort();
  const milestones = Array.from(
    { length: Math.floor(posts.length / 100) },
    (_, i) => {
      const first = posts[i * 100].date,
        last = posts[(i + 1) * 100 - 1].date;
      return {
        count: (i + 1) * 100,
        date: last,
        days: allWorkoutDates.filter((d) => d >= first && d <= last).length,
        calendar: daysBetween(first, last),
      };
    },
  );
  const shiftMonth = (amount: number) => {
    const next = new Date(Date.UTC(yearNum, monthNum - 1 + amount, 1));
    setMonth(next.toISOString().slice(0, 7));
  };
  const nextMilestone = nextPostMilestone(posts.length);
  return (
    <div className={styles.profile}>
      <button className={styles.back} onClick={close}>
        <Icon kind="arrow" />
        Back to filtered results
      </button>
      <div className={styles.profileHeading}>
        <div>
          <h2 data-pax-heading tabIndex={-1}>
            {displayName}
          </h2>
          <p>
            All-time recorded attendance
            {person?.region ? ` · ${person.region}` : ""}
            {person?.ehBy ? ` · EH’d by ${person.ehBy}` : ""}
          </p>
        </div>
        <button
          onClick={() =>
            downloadCSV(
              "bedrock-pax-attendance.csv",
              RAW_COLUMNS.map((c) => c.label),
              rows.map((row) => RAW_COLUMNS.map((c) => row[c.key])),
            )
          }
        >
          <Icon kind="download" />
          PAX CSV
        </button>
      </div>
      <dl className={styles.profileStats}>
        {[
          ["Posts", number(posts.length)],
          ["Qs", number(posts.filter((r) => r.q).length)],
          ["First post", formatDate(posts[0]?.date ?? "")],
          ["Last post", formatDate(posts.at(-1)?.date ?? "")],
          ["Best streak", `${profile?.streak ?? 0} days`],
          ["Q ratio", `${(profile?.qRatio ?? 0).toFixed(1)}%`],
          [
            "Qsource posts / Qs",
            `${qs.length} / ${qs.filter((r) => r.qsq).length}`,
          ],
          ["First Q", formatDate(posts.find((r) => r.q)?.date ?? "")],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className={styles.detailGrid}>
        <section
          className={styles.calendarSection}
          aria-labelledby="calendar-heading"
        >
          <div className={styles.sectionHeading}>
            <h3 id="calendar-heading">Attendance calendar</h3>
            <div className={styles.monthControls}>
              <button
                aria-label="Previous month"
                onClick={() => shiftMonth(-1)}
              >
                ‹
              </button>
              <input
                aria-label="Calendar month"
                type="month"
                value={month}
                onChange={(e) => {
                  if (e.target.value && /^\d{4}-\d{2}$/.test(e.target.value))
                    setMonth(e.target.value);
                }}
              />
              <button aria-label="Next month" onClick={() => shiftMonth(1)}>
                ›
              </button>
            </div>
          </div>
          <div
            className={styles.calendar}
            role="group"
            aria-label={`Attendance for ${month}`}
          >
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
              <span className={styles.weekday} key={day}>
                {day}
              </span>
            ))}
            {Array.from({ length: firstWeekday }, (_, i) => (
              <span key={`blank${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1,
                date = `${month}-${String(day).padStart(2, "0")}`,
                dayRows = calendarRows.filter((row) => row.date === date),
                dayPosts = dayRows.filter((row) => row.post),
                hasQ = dayPosts.some((row) => row.q),
                hasQS = dayRows.some((row) => row.qs);
              const summary = dayRows
                .filter((row) => row.post || row.qs)
                .map(
                  (row) =>
                    `${row.site}${row.post ? " · Post" : ""}${row.q ? " · Q" : ""}${row.qs ? " · QS" : ""}${row.qsq ? " · QS-Q" : ""}`,
                )
                .join("; ");
              return (
                <div
                  key={day}
                  className={`${styles.calendarDay} ${dayPosts.length ? styles.postDay : ""} ${hasQ ? styles.qDay : ""}`}
                  title={`${formatDate(date)}${summary ? ": " + summary : ": No recorded attendance"}`}
                  aria-label={`${formatDate(date)}${summary ? ": " + summary : ": No recorded attendance"}`}
                >
                  <span>{day}</span>
                  <small>
                    {hasQ
                      ? "Q"
                      : dayPosts.length > 1
                        ? `${dayPosts.length} posts`
                        : dayPosts.length
                          ? "Post"
                          : ""}
                    {hasQS ? " QS" : ""}
                  </small>
                </div>
              );
            })}
          </div>
          <p className={styles.viewNote}>
            Purple = post · green = Q · QS = Qsource. See the list below for
            each date’s details.
          </p>
          <details className={styles.monthList}>
            <summary>
              {number(calendarRows.filter((r) => r.post || r.qs).length)}{" "}
              attendance entries in {MONTHS[monthNum - 1]} {yearNum}
            </summary>
            {calendarRows.filter((r) => r.post || r.qs).length ? (
              <ul>
                {calendarRows
                  .filter((r) => r.post || r.qs)
                  .map((r, i) => (
                    <li key={i}>
                      <span>
                        {formatDate(r.date)} · {r.site}
                      </span>
                      <strong>
                        {[
                          r.post && "Post",
                          r.q && "Q",
                          r.qs && "QS",
                          r.qsq && "QS-Q",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </strong>
                    </li>
                  ))}
              </ul>
            ) : (
              <p>No posts or Qsource attendance this month.</p>
            )}
          </details>
        </section>
        <section className={styles.locations}>
          <h3>Posts by AO</h3>
          <div className={styles.listScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">AO</th>
                  <th scope="col">Posts</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((item) => (
                  <tr key={item.site}>
                    <td>{item.site || "Unspecified"}</td>
                    <td>{number(item.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!locations.length && <p>No recorded workout posts.</p>}
        </section>
      </div>
      <section className={styles.companions}>
        <div className={styles.sectionHeading}>
          <h3>Who you post with</h3>
          <div className={styles.peerFilters}>
            <label className={styles.srOnly} htmlFor="peer-relation">
              Relationship
            </label>
            <select
              id="peer-relation"
              value={relation}
              onChange={(e) => setRelation(e.target.value as typeof relation)}
            >
              <option value="with">Most posted with</option>
              <option value="by">Most Q’d by</option>
              <option value="led">Most Q’d</option>
            </select>
            <label className={styles.srOnly} htmlFor="peer-range">
              Post range
            </label>
            <select
              id="peer-range"
              value={range}
              onChange={(e) => setRange(e.target.value)}
            >
              <option value="all">All posts</option>
              <option value="recent">Most recent 100</option>
              {Array.from({ length: Math.ceil(posts.length / 100) }, (_, i) => (
                <option key={i} value={i * 100}>
                  Posts {i * 100 + 1}–{Math.min((i + 1) * 100, posts.length)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className={styles.viewNote}>
          Shared workouts match the same date and AO. Each person counts once
          per workout. Showing up to 15 of {peers.length} PAX.
        </p>
        {peers.length ? (
          <ol className={styles.peerList}>
            {peers.slice(0, 15).map((p) => (
              <li key={p.name}>
                <span>{p.name}</span>
                <strong>{number(p.count)}</strong>
              </li>
            ))}
          </ol>
        ) : (
          <p>No matching shared workouts in this post range.</p>
        )}
      </section>
      <section className={styles.milestones}>
        <h3>100-post milestones</h3>
        <Link className={styles.sourceLink} href={`/data/milestones?search=${encodeURIComponent(displayName)}&horizon=all`}>See milestone forecast</Link>
        <p>
          {number(nextMilestone - posts.length)} more posts to{" "}
          {number(nextMilestone)}.
        </p>
        {milestones.length > 0 && (
          <div
            className={styles.tableScroll}
            tabIndex={0}
            role="region"
            aria-label="Post milestones"
          >
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Milestone</th>
                  <th scope="col">Reached</th>
                  <th scope="col">Workout days / 100</th>
                  <th scope="col">Calendar days / 100</th>
                </tr>
              </thead>
              <tbody>
                {milestones.map((m) => (
                  <tr key={m.count}>
                    <td>{number(m.count)} posts</td>
                    <td>{formatDate(m.date)}</td>
                    <td>{number(m.days)}</td>
                    <td>{number(m.calendar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={styles.viewNote}>
          Days are measured separately for each block of 100 posts. Workout days
          are dates with a recorded Bedrock workout.
        </p>
      </section>
    </div>
  );
}
