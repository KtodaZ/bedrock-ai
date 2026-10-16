import styles from "./DataInsights.module.css";

/** Tiny bar chart in a fixed width; the text beside it carries the value for screen readers. */
export default function Sparkline({
  values,
  total,
  width = 70,
}: {
  values: (number | null)[];
  total: string;
  width?: number;
}) {
  const max = Math.max(1, ...values.map((v) => v ?? 0)),
    step = width / Math.max(1, values.length),
    bar = Math.max(1.5, step * 0.68),
    height = 18;
  return (
    <span className={styles.sparkCell}>
      <svg width={width} height={height} aria-hidden="true">
        {values.map((v, i) => {
          const h = v ? Math.max(3, (v / max) * height) : 1;
          return (
            <rect
              key={i}
              x={i * step}
              y={height - h}
              width={bar}
              height={h}
              rx={1}
              fill={
                v
                  ? i === values.length - 1
                    ? "#d9c2ff"
                    : "#9b72d4"
                  : "#3a2d4a"
              }
            />
          );
        })}
      </svg>
      <span>{total}</span>
    </span>
  );
}
