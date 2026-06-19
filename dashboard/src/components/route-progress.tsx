"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Thin gold progress bar at the top of the page.
 * Triggers on any route change — gives instant feedback in dev mode
 * where Turbopack can take 200ms–2s to compile a new route.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const firstRender = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    // New route mounted — flash complete then hide.
    if (timerRef.current) clearInterval(timerRef.current as never);
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    setProgress(100);
    finishTimerRef.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 220);
  }, [pathname]);

  // Expose a global start function so links / buttons can trigger it.
  useEffect(() => {
    const start = () => {
      setVisible(true);
      setProgress(15);
      if (timerRef.current) clearInterval(timerRef.current as never);
      let p = 15;
      timerRef.current = setInterval(() => {
        p = Math.min(85, p + (90 - p) * 0.12);
        setProgress(p);
      }, 160);
    };
    (window as unknown as { __routeProgress?: () => void }).__routeProgress = start;
    return () => {
      if (timerRef.current) clearInterval(timerRef.current as never);
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 200ms" }}
    >
      <div
        className="h-full bg-[var(--color-gold)] shadow-[0_0_8px_var(--color-gold)]"
        style={{
          width: `${progress}%`,
          transition: "width 160ms ease-out",
        }}
      />
    </div>
  );
}

/** Fire the progress bar from a click handler. Safe to call anywhere. */
export function startRouteProgress() {
  if (typeof window === "undefined") return;
  const fn = (window as unknown as { __routeProgress?: () => void }).__routeProgress;
  if (fn) fn();
}
