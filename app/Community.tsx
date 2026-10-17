"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ACTIVE_DAYS,
  FIRST_Q,
  FNG_STAGES,
  REGULAR_POSTS_90,
  familyTree,
  Q_MIX,
  aoKind,
  firstQCandidates,
  qMix,
  fngCohorts,
  fngTotals,
  regularQRatios,
  treeMatches,
  type FngCohort,
  type TreeNode,
} from "../lib/community";
import { normalizeDataName, type ExplorerData } from "../lib/dataExplorer";
import DataInsightsFrame, { insightDate } from "./DataInsightsFrame";
import common from "./DataExplorer.module.css";
import styles from "./DataInsights.module.css";

type Tab = "fngs" | "tree" | "q";
const TABS: { key: Tab; label: string }[] = [
  { key: "fngs", label: "FNGs" },
  { key: "tree", label: "Family tree" },
  { key: "q", label: "Q leaders" },
];
const STAGE_CLASS = {
  one: styles.stageOne,
  few: styles.stageFew,
  some: styles.stageSome,
  ten: styles.stageTen,
};
const profileURL = (name: string) =>
  "/data?" + new URLSearchParams({ period: "all", pax: name });
const monthLabel = (month: string) =>
  new Date(month + "-01T00:00:00Z").toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    year: "numeric",
  });
const percent = (n: number, of: number) =>
  of ? `${Math.round((n / of) * 100)}%` : "—";
function readTab(params: URLSearchParams): Tab {
  const tab = params.get("tab");
  return TABS.some((t) => t.key === tab) ? (tab as Tab) : "fngs";
}

export default function Community() {
  return (
    <DataInsightsFrame
      page="community"
      title="Community"
      description="How FNGs stick, who EH’d whom, and who’s ready to lead."
    >
      {(data) => <CommunityContent data={data} />}
    </DataInsightsFrame>
  );
}
function CommunityContent({ data }: { data: ExplorerData }) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() =>
    readTab(new URLSearchParams(searchParams.toString())),
  );
  useEffect(() => {
    window.history.replaceState(null, "", "/data/community?tab=" + tab);
  }, [tab]);
  useEffect(() => {
    const pop = () =>
      setTab(readTab(new URLSearchParams(window.location.search)));
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  return (
    <>
      <div className={styles.modeTabs} role="group" aria-label="Community view">
        {TABS.map((t) => (
          <button
            key={t.key}
            aria-pressed={tab === t.key}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "fngs" ? (
        <FngFollowThrough data={data} />
      ) : tab === "tree" ? (
        <FamilyTree data={data} />
      ) : (
        <QLeadership data={data} />
      )}
    </>
  );
}

function FngFollowThrough({ data }: { data: ExplorerData }) {
  const cohorts = useMemo(() => fngCohorts(data), [data]);
  const year = data.asOf.slice(0, 4);
  const totals = fngTotals(
    cohorts.filter((c) => c.month.startsWith(year)).flatMap((c) => c.fngs),
  );
  return (
    <>
      <dl className={styles.fngSummary} aria-label={`${year} FNGs`}>
        {[
          [`${year} Bedrock FNGs`, String(totals.count)],
          [
            "Came back for a 2nd",
            `${totals.returned} · ${percent(totals.returned, totals.count)}`,
          ],
          [
            "Reached 10 posts",
            `${totals.ten} · ${percent(totals.ten, totals.count)}`,
          ],
          [
            `Posted in last ${ACTIVE_DAYS} days`,
            `${totals.active} · ${percent(totals.active, totals.count)}`,
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className={styles.chartTitle}>
        <h2 id="fng-months-heading">FNGs by month</h2>
        <p>Posts each FNG has recorded since his first post · tap a month</p>
      </div>
      <ul className={styles.stageLegend} aria-label="Post count colors">
        {FNG_STAGES.map((s) => (
          <li key={s.key}>
            <span className={STAGE_CLASS[s.key]} aria-hidden="true" />
            {s.label}
          </li>
        ))}
      </ul>
      <p className={styles.note}>
        <em className={styles.earlyTerm}>Still early</em> marks the latest
        attendance month and the month before. Those FNGs have had only a few
        weeks to come back, so their counts will keep changing.
      </p>
      {cohorts.length ? (
        <div className={styles.cohorts}>
          {cohorts.map((c) => (
            <Cohort key={c.month} cohort={c} />
          ))}
        </div>
      ) : (
        <p className={styles.note}>No Bedrock FNGs are recorded yet.</p>
      )}
      <p className={styles.note}>
        FNGs follow the EH Challenge rule: the attendance FNG flag plus a
        Bedrock Roster region. PAX under 18 are hidden from public data, so
        this count can be lower than the EH Challenge total. Posts count distinct workout dates from the FNG
        date through {insightDate(data.asOf, true)}. Recent months haven’t had
        time to reach 10 posts. This shows follow-through only; it awards no
        points.
      </p>
    </>
  );
}
function Cohort({ cohort }: { cohort: FngCohort }) {
  const totals = fngTotals(cohort.fngs);
  const stageCounts = FNG_STAGES.map((s) => ({
    ...s,
    count: cohort.fngs.filter((f) => f.posts >= s.min && f.posts <= s.max)
      .length,
  }));
  return (
    <details className={styles.cohort}>
      <summary>
        <span className={styles.cohortMonth}>
          {monthLabel(cohort.month)}
          {cohort.early && <em>Still early</em>}
        </span>
        <span
          className={styles.cohortBar}
          role="img"
          aria-label={stageCounts
            .map((s) => `${s.count} with ${s.label}`)
            .join(", ")}
        >
          {stageCounts.map(
            (s) =>
              s.count > 0 && (
                <span
                  key={s.key}
                  className={STAGE_CLASS[s.key]}
                  style={{ flexGrow: s.count }}
                >
                  {s.count}
                </span>
              ),
          )}
        </span>
        <span className={styles.cohortCount}>
          {totals.count} {totals.count === 1 ? "FNG" : "FNGs"}
          <small>{totals.active} still posting</small>
        </span>
      </summary>
      <ol className={styles.cohortPeople}>
        {cohort.fngs.map((f) => (
          <li key={f.name}>
            <Link className={styles.nameLink} href={profileURL(f.name)}>
              {f.name}
            </Link>
            <span>
              {f.posts} {f.posts === 1 ? "post" : "posts"}
              {f.active ? "" : ` · last ${insightDate(f.lastPost, true)}`}
            </span>
            <small>
              FNG {insightDate(f.fngDate)}
              {f.ehBy ? ` · EH’d by ${f.ehBy}` : ""}
            </small>
          </li>
        ))}
      </ol>
    </details>
  );
}

function FamilyTree({ data }: { data: ExplorerData }) {
  const roots = useMemo(() => familyTree(data), [data]);
  const linked = useSearchParams().get("search");
  const [search, setSearch] = useState(() => (linked ?? "").slice(0, 200));
  const [showAll, setShowAll] = useState(false);
  const term = normalizeDataName(search);
  const shown = term ? roots.filter((r) => treeMatches(r, term)) : roots;
  const links = roots.reduce((sum, r) => sum + r.size, 0);
  return (
    <>
      <div className={styles.controls}>
        <label className={styles.searchLabel}>
          Find a PAX
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search F3 names…"
          />
        </label>
      </div>
      <div className={styles.chartTitle}>
        <h2 id="family-tree-heading">Who EH’d whom</h2>
        <p>
          {links} Roster EH’er links · {roots.length} family trees
        </p>
      </div>
      {shown.length ? (
        <ol className={styles.treeRoots}>
          {shown.slice(0, showAll || term ? undefined : 10).map((root) => (
            <li key={root.key}>
              <details open={!!term}>
                <summary>
                  <strong>{root.name}</strong>
                  <span>
                    EH’d {root.children.length}
                    {root.size > root.children.length
                      ? ` · ${root.size} in tree`
                      : ""}
                  </span>
                </summary>
                {root.posts > 0 && (
                  <p className={styles.treeLink}>
                    <TreeName
                      node={root}
                      term=""
                      label="View his profile"
                    />
                  </p>
                )}
                <TreeBranch nodes={root.children} term={term} />
              </details>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.note}>No one in the family trees matches that name.</p>
      )}
      {!term && roots.length > 10 && (
        <button
          className={styles.textButton}
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? "Show top 10" : `Show all ${roots.length} trees`}
        </button>
      )}
      <p className={styles.note}>
        Built from the Roster EH’er column exactly as spelled, matched the same
        way as the EH Challenge. A differently spelled EH’er starts a separate
        tree; corrections belong on the EH Challenge correction form, not here.
      </p>
    </>
  );
}
function TreeName({
  node,
  term,
  label,
}: {
  node: TreeNode;
  term: string;
  label?: string;
}) {
  const hit = !!term && normalizeDataName(node.name).includes(term);
  const text = label ?? node.name;
  return node.posts ? (
    <Link
      className={`${styles.nameLink} ${hit ? styles.treeHit : ""}`}
      href={profileURL(node.name)}
    >
      {text}
    </Link>
  ) : label ? null : (
    <span className={hit ? styles.treeHit : ""}>{text}</span>
  );
}
function TreeBranch({ nodes, term }: { nodes: TreeNode[]; term: string }) {
  if (!nodes.length) return null;
  return (
    <ul className={styles.treeBranch}>
      {nodes.map((n) => (
        <li key={n.key}>
          <TreeName node={n} term={term} />
          <small>
            {n.posts} {n.posts === 1 ? "post" : "posts"}
            {n.children.length ? ` · EH’d ${n.children.length}` : ""}
          </small>
          <TreeBranch nodes={n.children} term={term} />
        </li>
      ))}
    </ul>
  );
}

function QLeadership({ data }: { data: ExplorerData }) {
  const ready = useMemo(() => firstQCandidates(data), [data]);
  const regulars = useMemo(() => regularQRatios(data), [data]);
  const [showAll, setShowAll] = useState(false);
  return (
    <>
      <section aria-labelledby="first-q-heading">
        <div className={styles.chartTitle}>
          <h2 id="first-q-heading">Ready for a first Q</h2>
          <p>
            No recorded Q · {FIRST_Q.minPosts}+ posts · {FIRST_Q.minRecent}+
            posts in the last 30 days
          </p>
        </div>
        {ready.length ? (
          <ol className={styles.readyList}>
            {ready.map((p) => (
              <li key={p.name}>
                <Link className={styles.nameLink} href={profileURL(p.name)}>
                  {p.name}
                </Link>
                <span>
                  {p.posts} posts · {p.recent30} in last 30 days
                </span>
                <small>
                  {p.usualAO ? `Usually ${p.usualAO} · ` : ""}last post{" "}
                  {insightDate(p.lastPost)}
                </small>
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.note}>
            No PAX match these criteria right now.
          </p>
        )}
        <p className={styles.note}>
          A nudge list for Site Qs, not a ranking. Excludes 2.0s. Q history
          covers only this sheet.
        </p>
      </section>
      <section aria-labelledby="q-ratio-heading" className={styles.qRatioSection}>
        <div className={styles.chartTitle}>
          <h2 id="q-ratio-heading">Q ratio among regulars</h2>
          <p>
            {REGULAR_POSTS_90}+ posts in the 90 days ending{" "}
            {insightDate(data.asOf, true)}
          </p>
        </div>
        {regulars.length ? (
          <div
            className={common.tableScroll}
            tabIndex={0}
            role="region"
            aria-label="Q ratio among regulars"
          >
            <table className={common.table}>
              <thead>
                <tr>
                  <th scope="col" className={common.pinned}>
                    PAX
                  </th>
                  <th scope="col">Q ratio</th>
                  <th scope="col">Qs / posts</th>
                  <th scope="col">Last Q</th>
                </tr>
              </thead>
              <tbody>
                {regulars.slice(0, showAll ? undefined : 15).map((r) => (
                  <tr key={r.name}>
                    <td className={common.pinned}>
                      <Link className={styles.nameLink} href={profileURL(r.name)}>
                        {r.name}
                      </Link>
                    </td>
                    <td>{r.ratio.toFixed(1)}%</td>
                    <td>
                      {r.qs90} / {r.posts90}
                    </td>
                    <td>{r.lastQ ? insightDate(r.lastQ, true) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.note}>No PAX posted 13+ times in the last 90 days.</p>
        )}
        {regulars.length > 15 && (
          <button
            className={styles.textButton}
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Show top 15" : `Show all ${regulars.length} regulars`}
          </button>
        )}
        <p className={styles.note}>
          Q ratio is recorded Qs ÷ recorded posts in those 90 days. “Last Q”
          uses all recorded history.
        </p>
      </section>
      <RunBeatdownMix data={data} />
    </>
  );
}

function RunBeatdownMix({ data }: { data: ExplorerData }) {
  const { runOnly, mix } = useMemo(() => qMix(data), [data]);
  const [showAll, setShowAll] = useState(false);
  const runSites = [
    ...new Set(data.rows.map((r) => r.site).filter((s) => aoKind(s) === "run")),
  ].sort();
  return (
    <section aria-labelledby="run-only-heading" className={styles.qRatioSection}>
      <div className={styles.chartTitle}>
        <h2 id="run-only-heading">Run-site Qs, no beatdown yet</h2>
        <p>
          {Q_MIX.runOnlyMin}+ run-site Qs and no beatdown Q in the last{" "}
          {Q_MIX.days} days
        </p>
      </div>
      {runOnly.length ? (
        <ol className={styles.readyList}>
          {runOnly.map((m) => (
            <li key={m.name}>
              <Link className={styles.nameLink} href={profileURL(m.name)}>
                {m.name}
              </Link>
              <span>
                {m.run} run-site Qs · last {insightDate(m.lastRun, true)}
              </span>
              <small>
                {m.lastBeatdown
                  ? `Last beatdown Q ${insightDate(m.lastBeatdown, true)}`
                  : "No recorded beatdown Q"}
              </small>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.note}>No one matches right now.</p>
      )}
      <div className={styles.chartTitle}>
        <h2 id="q-mix-heading">Q mix: run sites vs beatdowns</h2>
        <p>
          {Q_MIX.mixMin}+ Qs at listed AOs in the last {Q_MIX.days} days ·
          most run-heavy first
        </p>
      </div>
      {mix.length ? (
        <div
          className={common.tableScroll}
          tabIndex={0}
          role="region"
          aria-labelledby="q-mix-heading"
        >
          <table className={common.table}>
            <thead>
              <tr>
                <th scope="col" className={common.pinned}>
                  Q
                </th>
                <th scope="col">Run</th>
                <th scope="col">Beatdown</th>
                <th scope="col">Run share</th>
              </tr>
            </thead>
            <tbody>
              {mix.slice(0, showAll ? undefined : 15).map((m) => (
                <tr key={m.name}>
                  <td className={common.pinned}>
                    <Link className={styles.nameLink} href={profileURL(m.name)}>
                      {m.name}
                    </Link>
                  </td>
                  <td>{m.run}</td>
                  <td>{m.beatdown}</td>
                  <td>{Math.round(m.runShare)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.note}>No Qs have enough recorded Qs yet.</p>
      )}
      {mix.length > 15 && (
        <button
          className={styles.textButton}
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? "Show top 15" : `Show all ${mix.length} Qs`}
        </button>
      )}
      <p className={styles.note}>
        Run sites: {runSites.join(", ")}. Every other listed AO is a beatdown;
        AOs without a type, like CSAUP, aren’t counted.
      </p>
    </section>
  );
}
