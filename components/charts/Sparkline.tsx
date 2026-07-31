import { linePath, scaleLinear } from "@/lib/chart";

const VB_W = 72;
const VB_H = 20;

/** A shape, not a chart — no axes, no hover, no labels. It sits inside a KPI
 *  tile to say "and here's the direction", where the tile's own number is the
 *  actual value. Server component on purpose: nothing here is interactive, so
 *  it costs no client JS. Hiding balances doesn't hide this — a shape with no
 *  scale leaks no figure. */
export function Sparkline({ values, tone = "mag" }: { values: number[]; tone?: "mag" | "in" | "out" }) {
  if (values.length < 2) return null;

  const max = Math.max(...values, 1);
  const xScale = scaleLinear([0, values.length - 1], [1, VB_W - 1]);
  const yScale = scaleLinear([0, max], [VB_H - 2, 2]);
  const coords = values.map((v, i) => ({ x: xScale(i), y: yScale(v) }));

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className="h-5 w-[72px] overflow-visible"
      aria-hidden
      focusable="false"
    >
      <path
        d={linePath(coords)}
        fill="none"
        className={
          tone === "in" ? "stroke-chart-in" : tone === "out" ? "stroke-chart-out" : "stroke-chart-mag"
        }
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
