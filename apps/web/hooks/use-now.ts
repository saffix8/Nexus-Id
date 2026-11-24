"use client";

import { useEffect, useState } from "react";

/**
 * Current time in ms, or `null` during server render and the first client render.
 * Anything time-relative ("3 min ago") must render a placeholder while this is null,
 * otherwise server and client markup differ (hydration mismatch).
 */
export function useNow(intervalMs = 15_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
