"use client";

import { formatPKRWhole } from "@/lib/format";
import { useHideBalances } from "@/lib/use-hide-balances";

export interface LiquiditySegment {
  key: "liquid" | "invested" | "receivable";
  label: string;
  value: number;
}

/** Ordinal ramp, most-liquid first — see the --color-liq-* note in globals.css
 *  for why this is one hue rather than three categorical ones, and the chart-mark
 *  note there for why these are utility classes and not inline `var()`. The
 *  class strings must stay literal for Tailwind to see them. */
const RAMP: Record<LiquiditySegment["key"], string> = {
  liquid: "bg-liq-1",
  invested: "bg-liq-2",
  receivable: "bg-liq-3",
};

/** Net worth, decomposed by how fast you can actually reach the money.
 *
 *  This is the one view only this app can draw: it's the only place where
 *  account balances, PSX holdings and udhaar all live, so it's the only place
 *  that can answer "of everything I'm worth, how much can I touch today".
 *  What you OWE is drawn as a notch outside the bar rather than a fourth
 *  segment, because a liability isn't a slice of your assets — it's a claim
 *  against them, and stacking it inside would overstate the total. */
export function LiquidityBar({
  segments,
  owed,
}: {
  segments: LiquiditySegment[];
  owed: number;
}) {
  const [hidden] = useHideBalances();
  const present = segments.filter((s) => s.value > 0);
  const assets = present.reduce((sum, s) => sum + s.value, 0);
  if (assets <= 0) return null;

  return (
    <div>
      {/* 2px surface gaps between segments — a stacked fill needs the spacer so
          adjacent ramp steps stay countable, not just distinguishable. */}
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-[3px]">
        {present.map((s) => (
          <div
            key={s.key}
            style={{ width: `${(s.value / assets) * 100}%` }}
            className={`h-full first:rounded-l-[3px] last:rounded-r-[3px] ${RAMP[s.key]}`}
          />
        ))}
      </div>

      {/* Legend is always present for >= 2 segments, and every segment is also
          direct-labeled with its figure — identity is never colour-alone. */}
      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {present.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span aria-hidden className={`size-2 shrink-0 rounded-[2px] ${RAMP[s.key]}`} />
            <dt className="t-micro text-fg-faint">{s.label}</dt>
            <dd className="tnum font-num text-[12px] text-fg-muted">
              {hidden ? "••••" : formatPKRWhole(s.value)}
            </dd>
          </div>
        ))}

        {/* A liability gets the same legend row as an asset, but no bar segment
            and no proportional mark of its own. It was drawn as a scaled bar
            first, and against a large asset base that clamped to a ~2% stub
            that read as a rendering artifact rather than a number. Text is the
            honest encoding for one value with no share of the whole. */}
        {owed > 0 ? (
          <div className="flex items-center gap-1.5">
            <span aria-hidden className="size-2 shrink-0 rounded-[2px] bg-out" />
            <dt className="t-micro text-fg-faint">You owe</dt>
            <dd className="tnum font-num text-[12px] text-out">
              −{hidden ? "••••" : formatPKRWhole(owed)}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
