"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, X } from "lucide-react";
import clsx from "clsx";

export interface HistoryRange {
  from?: string;
  to?: string;
}

/** Presets first, custom second.
 *
 *  The previous filter was two bare date inputs and a Go button sharing one
 *  flex row: the inputs had no width floor, so on a 390px phone they collapsed
 *  and the button sat on top of the "To" field. It was also the wrong control
 *  — picking two dates from a native picker to answer "what did I spend this
 *  month" is a lot of taps for the question people actually ask. Presets cover
 *  that in one tap; the range picker stays for the rare exact lookup. */
// Labels kept short so all five controls fit a 390px screen without the row
// scrolling — a filter you have to scroll to discover is a filter you don't use.
const PRESETS = [
  { key: "all", label: "All" },
  { key: "30d", label: "30d" },
  { key: "month", label: "Month" },
  { key: "last", label: "Last" },
] as const;

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function presetRange(key: (typeof PRESETS)[number]["key"]): HistoryRange {
  const now = new Date();
  switch (key) {
    case "30d": {
      const from = new Date(now);
      from.setDate(from.getDate() - 29);
      return { from: isoDay(from), to: isoDay(now) };
    }
    case "month":
      return { from: isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDay(now) };
    case "last": {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: isoDay(first), to: isoDay(last) };
    }
    default:
      return {};
  }
}

/** Which preset (if any) the current URL range corresponds to, so the active
 *  pill survives a reload instead of resetting to "All". */
function activeKey(range: HistoryRange): string | null {
  if (!range.from && !range.to) return "all";
  for (const p of PRESETS) {
    if (p.key === "all") continue;
    const r = presetRange(p.key);
    if (r.from === range.from && r.to === range.to) return p.key;
  }
  return null; // a custom range
}

export function HistoryFilter({ range }: { range: HistoryRange }) {
  const router = useRouter();
  const active = activeKey(range);
  const [showCustom, setShowCustom] = useState(active === null);

  function apply(next: HistoryRange) {
    const params = new URLSearchParams();
    if (next.from) params.set("from", next.from);
    if (next.to) params.set("to", next.to);
    const qs = params.toString();
    router.push(qs ? `/history?${qs}` : "/history");
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Horizontally scrollable so the pills never wrap into a second row or
          squeeze their labels on a narrow phone. */}
      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              setShowCustom(false);
              apply(presetRange(p.key));
            }}
            className={clsx(
              "shrink-0 rounded-chip border px-3 py-1.5 text-[13px] transition-colors",
              active === p.key
                ? "border-accent bg-accent text-on-accent"
                : "border-rule bg-surface-lift text-fg-muted hover:text-fg",
            )}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowCustom((v) => !v)}
          aria-expanded={showCustom}
          className={clsx(
            "flex shrink-0 items-center gap-1.5 rounded-chip border px-3 py-1.5 text-[13px] transition-colors",
            active === null
              ? "border-accent bg-accent text-on-accent"
              : "border-rule bg-surface-lift text-fg-muted hover:text-fg",
          )}
        >
          <CalendarRange size={13} strokeWidth={1.75} aria-hidden />
          Range
        </button>
      </div>

      {showCustom ? (
        <form
          action="/history"
          method="GET"
          className="anim-rise flex flex-col gap-2 rounded-chip border border-rule bg-surface-lift p-3"
        >
          {/* Stacked, each input full width. The old side-by-side layout is
              what put the button on top of the field at this width. */}
          <div className="flex gap-2">
            <label className="min-w-0 flex-1">
              <span className="t-micro mb-1 block text-fg-faint">From</span>
              <input
                type="date"
                name="from"
                defaultValue={range.from ?? ""}
                className="tnum w-full rounded-chip border border-rule bg-surface-sunk px-2.5 py-2 font-num text-[13px] text-fg outline-none focus:border-accent"
              />
            </label>
            <label className="min-w-0 flex-1">
              <span className="t-micro mb-1 block text-fg-faint">To</span>
              <input
                type="date"
                name="to"
                defaultValue={range.to ?? ""}
                className="tnum w-full rounded-chip border border-rule bg-surface-sunk px-2.5 py-2 font-num text-[13px] text-fg outline-none focus:border-accent"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 rounded-chip bg-accent py-2 text-[13px] font-medium text-on-accent transition-transform duration-150 active:scale-[0.98]"
            >
              Apply range
            </button>
            {range.from || range.to ? (
              <button
                type="button"
                onClick={() => {
                  setShowCustom(false);
                  apply({});
                }}
                aria-label="Clear range"
                className="flex size-[34px] shrink-0 items-center justify-center rounded-chip border border-rule text-fg-muted transition-colors hover:text-fg"
              >
                <X size={14} strokeWidth={2} aria-hidden />
              </button>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
