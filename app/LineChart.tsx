"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import styles from "./DataInsights.module.css";

export interface ChartSeries {
  name: string;
  color: string;
  /** One value per label; null leaves a gap. */
  values: (number | null)[];
}
/** Where a tapped point leads: a page link, an in-page action, or nothing. */
export type PointTarget = string | (() => void) | null;

export default function LineChart({
  series,
  labels,
  title,
  description,
  pointTitle,
  pointTarget,
  targetLabel = "See workouts",
}: {
  series: ChartSeries[];
  labels: string[];
  title: string;
  description: string;
  pointTitle: (series: string, index: number, value: number) => string;
  pointTarget?: (series: string, index: number) => PointTarget;
  /** Names where a tapped point leads. */
  targetLabel?: string;
}) {
  const id = useId();
  const chartRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  const [picked, setPicked] = useState<number | null>(null);
  const selected = picked !== null && picked < labels.length ? picked : null;
  useEffect(() => {
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(300, entries[0].contentRect.width)),
    );
    if (chartRef.current) observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, []);
  // A tap outside the chart closes the open point.
  useEffect(() => {
    if (selected === null) return;
    const close = (e: PointerEvent) => {
      if (!chartRef.current?.contains(e.target as Node)) setPicked(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [selected]);
  const height = width < 600 ? 235 : 285,
    left = 45,
    right = 18,
    top = 18,
    bottom = 38;
  const allValues = series
    .flatMap((s) => s.values)
    .filter((v): v is number => v !== null);
  const max = Math.max(1, ...allValues),
    ceiling = Math.ceil(max / 4) * 4;
  const x = (i: number) =>
    left + (i / Math.max(1, labels.length - 1)) * (width - left - right);
  const y = (v: number) => top + (1 - v / ceiling) * (height - top - bottom);
  const fontSize = width < 600 ? 10 : 12;
  // Evenly spaced labels; skip one that would crowd the always-shown last label.
  const labelStep = Math.max(
    1,
    Math.ceil(labels.length / (width < 600 ? 4 : 7)),
  );
  const hasValue = (i: number) => series.some((s) => s.values[i] != null);
  // Taps pick the nearest week or month, so a finger doesn't have to hit a dot.
  const pick = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const step = (width - left - right) / Math.max(1, labels.length - 1);
    const i = Math.min(
      labels.length - 1,
      Math.max(
        0,
        Math.round(
          ((e.clientX - box.left) * (width / box.width) - left) / step,
        ),
      ),
    );
    setPicked(i === selected || !hasValue(i) ? null : i);
  };
  const move = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return setPicked(null);
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    let i = selected ?? (dir > 0 ? -1 : labels.length);
    do i += dir;
    while (i >= 0 && i < labels.length && !hasValue(i));
    if (i >= 0 && i < labels.length) setPicked(i);
  };
  return (
    <div
      ref={chartRef}
      className={styles.chartScroll}
      tabIndex={0}
      aria-label={`${title}. Use the arrow keys to read each point.`}
      onKeyDown={move}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={`${styles.lineChart} ${styles.pickable}`}
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
        onClick={pick}
      >
        <title id={`${id}-title`}>{title}</title>
        <desc id={`${id}-desc`}>{description}</desc>
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
                fontSize={fontSize}
              >
                {value.toFixed(ceiling <= 10 ? 1 : 0)}
              </text>
            </g>
          );
        })}
        {labels.map(
          (label, i, arr) =>
            (i === arr.length - 1 ||
              (i % labelStep === 0 && arr.length - 1 - i >= labelStep / 2)) && (
              <text
                key={i}
                x={x(i)}
                y={height - 11}
                textAnchor={
                  arr.length === 1
                    ? "start"
                    : i === 0
                      ? "start"
                      : i === arr.length - 1
                        ? "end"
                        : "middle"
                }
                fill="#b4a6c6"
                fontSize={fontSize}
              >
                {label}
              </text>
            ),
        )}
        {selected !== null && (
          <line
            x1={x(selected)}
            x2={x(selected)}
            y1={top}
            y2={height - bottom}
            stroke="#b4a6c6"
            strokeOpacity="0.55"
          />
        )}
        {series.map((s) => {
          let drawing = false;
          const path = s.values
            .map((value, i) => {
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
              {s.values.map((value, i) =>
                value === null ? null : (
                  <circle
                    key={i}
                    cx={x(i)}
                    cy={y(value)}
                    r={i === selected ? 6 : 3.5}
                    fill={s.color}
                    stroke={i === selected ? "#0b0812" : undefined}
                    strokeWidth="2"
                  >
                    <title>{pointTitle(s.name, i, value)}</title>
                  </circle>
                ),
              )}
            </g>
          );
        })}
      </svg>
      {selected !== null && (
        <div
          className={styles.pointCard}
          aria-live="polite"
          style={
            x(selected) < width / 2
              ? { left: `calc(${(x(selected) / width) * 100}% + 10px)` }
              : { right: `calc(${(1 - x(selected) / width) * 100}% + 10px)` }
          }
        >
          {series.map((s) => {
            const value = s.values[selected];
            if (value == null) return null;
            const target = pointTarget?.(s.name, selected) ?? null;
            const text = (
              <>
                <span style={{ backgroundColor: s.color }} aria-hidden="true" />
                <span>
                  {pointTitle(s.name, selected, value)}
                  {target && <b>{targetLabel} ›</b>}
                </span>
              </>
            );
            return typeof target === "string" ? (
              <Link key={s.name} href={target}>
                {text}
              </Link>
            ) : target ? (
              <button key={s.name} type="button" onClick={target}>
                {text}
              </button>
            ) : (
              <p key={s.name}>{text}</p>
            );
          })}
        </div>
      )}
    </div>
  );
}
