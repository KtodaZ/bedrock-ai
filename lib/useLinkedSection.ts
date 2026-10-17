"use client";
import { useEffect, useState } from "react";

/**
 * Scrolls to the section a link names in its #hash once the page's data has rendered.
 * Pages rewrite their URLs as they load, so the hash is read when the page mounts.
 */
export function useLinkedSection(ready: boolean) {
  const [id] = useState(() =>
    typeof window === "undefined" ? "" : decodeURIComponent(window.location.hash.slice(1)),
  );
  useEffect(() => {
    if (!ready || !id) return;
    // After the page's own scroll and focus handling for newly opened views.
    const timer = setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 50);
    return () => clearTimeout(timer);
  }, [ready, id]);
}
