"use client";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import styles from "./DataInsights.module.css";

export interface SwipeView {
  key: string;
  label: string;
  content: ReactNode;
}
/**
 * Tabs whose panels also swipe sideways. The track takes the active panel's
 * height so short views don't leave a gap. Off-screen panels are inert.
 */
export default function SwipeViews({
  label,
  views,
  index,
  onIndexChange,
}: {
  label: string;
  views: SwipeView[];
  index: number;
  onIndexChange: (index: number) => void;
}) {
  const id = useId();
  const track = useRef<HTMLDivElement>(null);
  const panels = useRef<(HTMLDivElement | null)[]>([]);
  // While a tab tap scrolls smoothly, ignore the panels it passes on the way.
  const target = useRef<number | null>(null);
  const [height, setHeight] = useState<number>();
  const measure = useCallback(() => {
    const panel = panels.current[index];
    if (panel) setHeight(panel.offsetHeight);
  }, [index]);
  useLayoutEffect(measure, [measure]);
  useEffect(() => {
    const observer = new ResizeObserver(measure);
    panels.current.forEach((p) => p && observer.observe(p));
    return () => observer.disconnect();
  }, [measure, views.length]);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const left = index * el.clientWidth;
    if (Math.abs(el.scrollLeft - left) < 2) return;
    target.current = index;
    el.scrollTo({ left, behavior: "smooth" });
  }, [index]);
  const onScroll = () => {
    const el = track.current;
    if (!el || !el.clientWidth) return;
    const at = el.scrollLeft / el.clientWidth;
    const nearest = Math.round(at);
    if (Math.abs(at - nearest) > 0.02) return;
    if (target.current !== null) {
      if (nearest !== target.current) return;
      target.current = null;
    }
    if (nearest !== index) onIndexChange(nearest);
  };
  return (
    <div className={styles.swipe}>
      <div role="tablist" aria-label={label} className={styles.swipeTabs}>
        {views.map((v, i) => (
          <button
            key={v.key}
            role="tab"
            id={`${id}-tab-${i}`}
            aria-selected={i === index}
            aria-controls={`${id}-panel-${i}`}
            tabIndex={i === index ? 0 : -1}
            onClick={() => onIndexChange(i)}
            onKeyDown={(e) => {
              const step =
                e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (!step) return;
              e.preventDefault();
              const next = (i + step + views.length) % views.length;
              onIndexChange(next);
              document.getElementById(`${id}-tab-${next}`)?.focus();
            }}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div
        ref={track}
        className={styles.swipeTrack}
        style={height ? { height } : undefined}
        onScroll={onScroll}
        // A direct swipe takes over from a tab tap's smooth scroll.
        onPointerDown={() => (target.current = null)}
        onTouchStart={() => (target.current = null)}
        onWheel={() => (target.current = null)}
      >
        {views.map((v, i) => (
          <div
            key={v.key}
            ref={(el) => {
              panels.current[i] = el;
            }}
            role="tabpanel"
            id={`${id}-panel-${i}`}
            aria-labelledby={`${id}-tab-${i}`}
            className={styles.swipePanel}
            inert={i !== index}
          >
            {v.content}
          </div>
        ))}
      </div>
      <div className={styles.swipeDots} aria-hidden="true">
        {views.map((v, i) => (
          <span key={v.key} data-active={i === index || undefined} />
        ))}
      </div>
    </div>
  );
}
