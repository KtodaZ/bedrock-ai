"use client";
import { useEffect, useId, useRef, useState } from "react";
import styles from "./DataInsights.module.css";

export interface ChartSeries {
  name: string;
  color: string;
  /** One value per label; null leaves a gap. */
  values: (number | null)[];
}
export default function LineChart({
  series,
  labels,
  title,
  description,
  pointTitle,
}: {
  series: ChartSeries[];
  labels: string[];
  title: string;
  description: string;
  pointTitle: (series: string, index: number, value: number) => string;
}) {
  const id = useId();
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
  return (
    <div ref={chartRef} className={styles.chartScroll}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={styles.lineChart}
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
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
                    r="3.5"
                    fill={s.color}
                  >
                    <title>{pointTitle(s.name, i, value)}</title>
                  </circle>
                ),
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
