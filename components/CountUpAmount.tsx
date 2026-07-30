"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { formatPKR } from "@/lib/format";
import { useHideBalances } from "@/lib/use-hide-balances";

/** Animates a number from its previous value to a new one — DESIGN.md §6
 *  "Balance change: count-up, tabular so zero layout shift." tnum keeps digit
 *  columns fixed-width so the count doesn't jitter horizontally as it ticks.
 *  Respects prefers-reduced-motion by setting the value instantly. */
export function CountUpAmount({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(0);
  const mountedRef = useRef(false);
  const [hidden] = useHideBalances();

  useEffect(() => {
    // No point animating toward a number that's about to be masked anyway.
    if (hidden) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }

    const from = mountedRef.current ? fromRef.current : 0;
    mountedRef.current = true;
    const to = value;
    const duration = 700;
    const start = performance.now();
    let raf = 0;

    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Re-runs only when the target value or hidden-state changes, intentionally not on `from`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, hidden]);

  return (
    <span className={clsx("tnum", className)}>
      {hidden ? "••••••" : formatPKR(Math.round(display))}
    </span>
  );
}
