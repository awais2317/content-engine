"use client";

import { useEffect, useState } from "react";

export function Topbar() {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const r = await fetch("/api/v1/settings", { cache: "no-store" });
        if (!cancelled) setOnline(r.ok);
      } catch {
        if (!cancelled) setOnline(false);
      }
    }
    check();
    const id = setInterval(check, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-bg px-8">
      <div className="md:hidden">
        <span className="font-display text-lg font-bold">Boston&apos;s Studio</span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-full border border-border-strong bg-surface px-3 py-1.5 text-xs text-muted-strong">
          <span
            className={`h-2 w-2 rounded-full ${
              online === null
                ? "bg-amber-500 animate-pulse-soft"
                : online
                  ? "bg-emerald-500"
                  : "bg-red-500"
            }`}
          />
          {online === null ? "Checking…" : online ? "Backend online" : "Backend offline"}
        </div>
      </div>
    </header>
  );
}
