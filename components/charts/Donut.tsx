"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { formatPKRWhole } from "@/lib/format";
import { useHideBalances } from "@/lib/use-hide-balances";

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  /** True only for the folded "everything else" slice — gets the neutral
   *  gray instead of a searched hue (see globals.css's --color-cat-* note). */
  isOther?: boolean;
}

// Fixed order, categorical — cat-1..4 are a validated identity set (dataviz
// skill: assign categorical hues in fixed order, never cycled). A slice
// keeps its color as the underlying data changes rank; it's addressed by
// POSITION in the fixed 4-slot cycle, not by "biggest gets color 1" — that
// would repaint a category out from under a returning viewer the next time
// its rank shifted.
const SLOT_CLASS = ["stroke-cat-1", "stroke-cat-2", "stroke-cat-3", "stroke-cat-4"];
const SWATCH_CLASS = ["bg-cat-1", "bg-cat-2", "bg-cat-3", "bg-cat-4"];

const SIZE = 168;
const STROKE = 26;
const R = (SIZE - STROKE) / 2;
const GAP_PCT = 0.7; // ~2-3px of visual gap between segments, in 0-100 units

/** Category breakdown, at a glance. A part-to-whole donut is the one place
 *  the dataviz skill sanctions a pie/donut at all — "part-to-whole at a
 *  glance only, ≤ 6 segments" — which is why this folds anything past the
 *  top 4 into "Other" rather than drawing every category. RankBars below
 *  stays the tool for actually comparing two close categories; a donut is
 *  bad at that job even when it's the right form for the overview.
 *
 *  Every arc uses `pathLength={100}`, which tells the browser to treat the
 *  circle's total length as exactly 100 units regardless of its real radius
 *  — so dasharray/dashoffset become plain percentages. The alternative (hand
 *  computing `2 * Math.PI * r` and hoping it matches what the renderer
 *  considers the path's real length) is the more common technique but is one
 *  more place for a stale or slightly-off constant to silently desync from
 *  the browser's own number; pathLength removes that class of bug entirely. */
export function Donut({ slices, total }: { slices: DonutSlice[]; total: number }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [hidden] = useHideBalances();

  useEffect(() => {
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  if (total <= 0 || slices.length === 0) return null;

  const usablePct = 100 - GAP_PCT * slices.length;

  let cursor = 0;
  const arcs = slices.map((s) => {
    const lengthPct = Math.max((s.value / total) * usablePct, 0);
    // Where this slice's dash ENDS UP once revealed — percent along the path,
    // measured from the rotated start point (12 o'clock, via the <g> below).
    const finalOffsetPct = 100 - cursor;
    cursor += lengthPct + GAP_PCT;
    return { ...s, lengthPct, finalOffsetPct };
  });

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width={SIZE}
          height={SIZE}
          role="img"
          aria-label="Spending by category"
        >
          {/* recessive track underneath every segment */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            strokeWidth={STROKE}
            className="stroke-rule-soft"
          />
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {arcs.map((a, i) => {
              const dim = selected !== null && selected !== a.key;
              // Before reveal, the dash is rotated fully past its own start
              // point — same length, just not there yet — so it sweeps into
              // place rather than fading or popping in.
              const offset = revealed ? a.finalOffsetPct : a.finalOffsetPct + a.lengthPct;
              return (
                <circle
                  key={a.key}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={R}
                  pathLength={100}
                  fill="none"
                  strokeWidth={STROKE}
                  strokeDasharray={`${a.lengthPct} ${100 - a.lengthPct}`}
                  strokeDashoffset={offset}
                  className={clsx(
                    "donut-arc cursor-pointer transition-opacity duration-200",
                    a.isOther ? "stroke-cat-other" : SLOT_CLASS[i % SLOT_CLASS.length],
                    dim && "opacity-30",
                  )}
                  style={{ transitionDelay: `${Math.min(i * 90, 270)}ms` }}
                  onClick={() => setSelected(selected === a.key ? null : a.key)}
                />
              );
            })}
          </g>
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="t-micro text-fg-faint">
            {selected ? arcs.find((a) => a.key === selected)?.label : "Total"}
          </span>
          <span className="tnum font-num text-[17px] leading-tight">
            {hidden ? "••••" : formatPKRWhole(selected ? arcs.find((a) => a.key === selected)!.value : total)}
          </span>
        </div>
      </div>

      {/* Legend is the direct-label layer this palette's CVD floor obligates
          (globals.css note) — every slice's name and share are text, never
          color-only. Rows double as the tap target for the emphasis above.
          Plain divs, not a <dl>: each row needs to be a real <button> for the
          tap target, and dt/dd are only valid as a dl's direct children —
          nesting them inside a button isn't. */}
      <div role="list" aria-label="Categories" className="min-w-0 flex-1 space-y-2">
        {arcs.map((a, i) => {
          const pct = total > 0 ? Math.round((a.value / total) * 100) : 0;
          const dim = selected !== null && selected !== a.key;
          return (
            <button
              key={a.key}
              type="button"
              role="listitem"
              onClick={() => setSelected(selected === a.key ? null : a.key)}
              className={clsx(
                "flex w-full items-center gap-2 text-left transition-opacity duration-200",
                dim && "opacity-40",
              )}
            >
              <span
                aria-hidden
                className={clsx(
                  "size-2.5 shrink-0 rounded-[2px]",
                  a.isOther ? "bg-cat-other" : SWATCH_CLASS[i % SWATCH_CLASS.length],
                )}
              />
              <span className="t-label min-w-0 flex-1 truncate text-fg">{a.label}</span>
              <span className="tnum shrink-0 whitespace-nowrap text-[12px] text-fg-muted">
                {pct}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
