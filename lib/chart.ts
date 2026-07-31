// Minimal SVG path helpers for hand-built charts. No chart library — a
// single-series trend line and a category bar list don't need one, and the
// dataviz skill's own guidance is to keep marks as plain SVG.

export interface ChartPoint {
  x: number;
  y: number;
}

/** Straight-segment polyline path — thin marks, no smoothing (dataviz skill:
 *  never imply precision the data doesn't have). */
export function linePath(points: ChartPoint[]): string {
  if (points.length === 0) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

/** Closed area path for the ~10% wash under a line (DESIGN.md §11.4). */
export function areaPath(points: ChartPoint[], baselineY: number): string {
  if (points.length === 0) return "";
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return `${linePath(points)} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
}

/** Rounded axis ceiling + evenly spaced ticks. A chart whose y-axis tops out at
 *  the raw max ("1,347") reads as noise; snapping to 1/2/2.5/5 x a power of ten
 *  gives ticks a reader can do arithmetic against. Returns the ticks ascending,
 *  with the last one being the axis ceiling. */
export function niceTicks(max: number, count = 3): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0];
  const rough = max / count;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(v);
  return ticks;
}

/** Compact axis labels — "12k", "1.4m". Axis ticks are for orders of magnitude,
 *  not exact figures; the tooltip and the table carry the precise number. */
export function compactNumber(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1)}m`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(abs % 1_000 === 0 ? 0 : 1)}k`;
  return String(Math.round(v));
}

/** domain -> range mapper. y ranges are typically passed inverted
 *  ([heightMinusPad, pad]) since a larger data value should sit higher on
 *  screen, i.e. a smaller pixel y. */
export function scaleLinear(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}
