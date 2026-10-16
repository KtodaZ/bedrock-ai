"use client";
import Link from "next/link";
import { useMemo } from "react";
import { regionPulse } from "../lib/attendanceTrends";
import type { ExplorerData } from "../lib/dataExplorer";
import { aoURL } from "../lib/aoProfile";
import { insightDate } from "./DataInsightsFrame";
import styles from "./DataInsights.module.css";

function Change({ now, before }: { now: number; before: number }) {
  const diff = now - before;
  if (!diff) return <small className={styles.pulseFlat}>Same as prior 7 days</small>;
  return (
    <small className={diff > 0 ? styles.pulseUp : styles.pulseDown}>
      <span aria-hidden="true">{diff > 0 ? "▲" : "▼"}</span>{" "}
      {Math.abs(diff).toLocaleString("en-US")} {diff > 0 ? "more" : "fewer"}{" "}
      than prior 7 days
    </small>
  );
}

/** Last 7 recorded days vs the 7 before, anchored to the latest attendance date. */
export default function RegionPulse({ data }: { data: ExplorerData }) {
  const { current, previous } = useMemo(() => regionPulse(data), [data]);
  return (
    <section className={styles.pulse} aria-labelledby="pulse-heading">
      <div className={styles.pulseHeading}>
        <h2 id="pulse-heading">
          Last 7 days{" "}
          <span>
            {insightDate(current.from)} – {insightDate(current.to)}
          </span>
        </h2>
        <Link href="/data/trends">See trends ›</Link>
      </div>
      <dl>
        <div>
          <dt>Posts</dt>
          <dd>{current.posts.toLocaleString("en-US")}</dd>
          <Change now={current.posts} before={previous.posts} />
        </div>
        <div>
          <dt>Unique PAX</dt>
          <dd>{current.pax.toLocaleString("en-US")}</dd>
          <Change now={current.pax} before={previous.pax} />
        </div>
        <div>
          <dt>Bedrock FNGs</dt>
          <dd>{current.fngs}</dd>
          <Change now={current.fngs} before={previous.fngs} />
        </div>
        <div>
          <dt>Biggest turnout</dt>
          <dd className={styles.pulseAO}>
            {current.topAO ? (
              <Link href={aoURL(current.topAO.site)}>{current.topAO.site}</Link>
            ) : (
              "—"
            )}
          </dd>
          {current.topAO && (
            <small className={styles.pulseFlat}>
              {current.topAO.average.toFixed(1)} PAX per workout
            </small>
          )}
        </div>
      </dl>
    </section>
  );
}
