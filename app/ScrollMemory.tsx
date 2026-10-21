"use client";
import { useEffect } from "react";

const PREFIX = "scroll:";
/** How long a restored position is held while the page's data renders. */
const HOLD_MS = 2500;

const key = () => PREFIX + location.pathname + location.search;
/** The page's scrolling area: a container marked data-scroll-memory, else the window. */
const scroller = () =>
  document.querySelector<HTMLElement>("[data-scroll-memory]") ??
  (document.scrollingElement as HTMLElement);

/**
 * Data pages scroll inside their own container, which the browser can't restore on Back.
 * This remembers each URL's position for the tab and puts it back on Back/Forward or reload,
 * holding it until the content is tall enough or the person scrolls. A link to a new entry
 * starts that container at the top; Next only resets the window, and a container shared by
 * views of the same page would otherwise keep the old position.
 */
export default function ScrollMemory() {
  useEffect(() => {
    let target = 0,
      until = 0,
      holding = 0,
      saving = 0;
    const stop = () => {
      until = 0;
      cancelAnimationFrame(holding);
    };
    const hold = () => {
      if (performance.now() > until) return stop();
      const el = scroller();
      if (
        el.scrollHeight - el.clientHeight >= target &&
        Math.abs(el.scrollTop - target) > 1
      )
        el.scrollTop = target;
      holding = requestAnimationFrame(hold);
    };
    const restore = () => {
      stop();
      const saved = sessionStorage.getItem(key());
      if (saved === null) return;
      target = Number(saved);
      until = performance.now() + HOLD_MS;
      holding = requestAnimationFrame(hold);
    };
    const save = (e: Event) => {
      const el = scroller();
      const fromWindow =
        e.target === document && el === document.scrollingElement;
      if (e.target !== el && !fromWindow) return;
      cancelAnimationFrame(saving);
      saving = requestAnimationFrame(() => {
        try {
          sessionStorage.setItem(key(), String(Math.round(el.scrollTop)));
        } catch {
          // Storage can be full or blocked; Back then starts at the top.
        }
      });
    };
    const nav = performance.getEntriesByType("navigation")[0] as
      PerformanceNavigationTiming | undefined;
    if (nav?.type === "back_forward" || nav?.type === "reload") restore();
    window.addEventListener("popstate", restore);
    // Page-specific scrolls (a #section or jump=results) run after this and still win.
    const push = window.history.pushState;
    const pushTop: typeof push = (...args) => {
      push.apply(window.history, args);
      stop();
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>("[data-scroll-memory]");
        if (el) el.scrollTop = 0;
      });
    };
    window.history.pushState = pushTop;
    // A page rewriting its own URL (a profile's calendar month) keeps its position for Back.
    const replace = window.history.replaceState;
    const replaceKeep: typeof replace = (...args) => {
      const before = key();
      replace.apply(window.history, args);
      if (key() === before || until) return;
      try {
        sessionStorage.setItem(key(), String(Math.round(scroller().scrollTop)));
      } catch {
        // As in save.
      }
    };
    window.history.replaceState = replaceKeep;
    document.addEventListener("scroll", save, { capture: true, passive: true });
    // Any scroll of their own ends the hold.
    const interrupts = ["wheel", "touchstart", "pointerdown", "keydown"];
    for (const type of interrupts)
      window.addEventListener(type, stop, { capture: true, passive: true });
    return () => {
      if (window.history.pushState === pushTop) window.history.pushState = push;
      if (window.history.replaceState === replaceKeep)
        window.history.replaceState = replace;
      stop();
      cancelAnimationFrame(saving);
      window.removeEventListener("popstate", restore);
      document.removeEventListener("scroll", save, { capture: true });
      for (const type of interrupts)
        window.removeEventListener(type, stop, { capture: true });
    };
  }, []);
  return null;
}
