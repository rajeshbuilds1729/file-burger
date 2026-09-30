"use client";

import { useEffect, useState } from "react";

/**
 * Safe prefers-reduced-motion detection (avoids hydration mismatch and works
 * in non-browser environments).
 */
export function useReducedMotionSafe(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Deferred to a microtask to avoid cascading renders.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setReduced(query.matches);
    });
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", listener);
    return () => {
      cancelled = true;
      query.removeEventListener("change", listener);
    };
  }, []);

  return reduced;
}
