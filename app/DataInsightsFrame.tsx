"use client";
import type { ReactNode } from "react";
import { useExplorerData } from "../lib/useExplorerData";
import type { ExplorerData } from "../lib/dataExplorer";
import DataSectionNav from "./DataSectionNav";
import common from "./DataExplorer.module.css";
import styles from "./DataInsights.module.css";

export function insightDate(date: string, year = false) {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(year ? { year: "numeric" as const } : {}),
  });
}
export default function DataInsightsFrame({
  page,
  title,
  description,
  children,
}: {
  page: "trends" | "aos" | "milestones" | "community";
  title: string;
  description: string;
  children: (data: ExplorerData) => ReactNode;
}) {
  const query = useExplorerData();
  return (
    <main className={common.shell} aria-label={title}>
      <div className={common.content}>
        <DataSectionNav active={page} />
        <h1>{title}</h1>
        <p className={styles.intro}>{description}</p>
        {query.isPending ? (
          <div className={common.loading} role="status">
            Loading recorded attendance…
          </div>
        ) : !query.data ? (
          <div className={common.empty} role="alert">
            <p>We couldn’t read the attendance sheet.</p>
            <button onClick={() => query.refetch()}>Try again</button>
          </div>
        ) : (
          <>
            <div className={common.freshness}>
              <span>
                Attendance through{" "}
                <strong>{insightDate(query.data.asOf, true)}</strong>
              </span>
            </div>
            {query.isRefetchError && (
              <p className={common.notice} role="alert">
                Couldn’t refresh attendance. Showing the last loaded data.
              </p>
            )}
            {children(query.data)}
          </>
        )}
      </div>
    </main>
  );
}
