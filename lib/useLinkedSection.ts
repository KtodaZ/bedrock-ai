"use client";
import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * Scrolls to the section a link names in its #hash once the page's data has rendered.
 * Pages rewrite their URLs as they load, so the hash is read when the page mounts: in a
 * layout effect, after Next has written a client navigation's URL but before the page's
 * own effects replace it.
 */
export function useLinkedSection(ready: boolean) {
  const id = useRef("");
  useLayoutEffect(() => {
    id.current = decodeURIComponent(window.location.hash.slice(1));
  }, []);
  useEffect(() => {
    if (!ready || !id.current) return;
    const target = id.current;
    // After the page's own scroll and focus handling for newly opened views.
    const timer = setTimeout(() => document.getElementById(target)?.scrollIntoView({ block: "start" }), 50);
    return () => clearTimeout(timer);
  }, [ready]);
}
