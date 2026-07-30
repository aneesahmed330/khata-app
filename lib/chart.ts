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

/** domain -> range mapper. y ranges are typically passed inverted
 *  ([heightMinusPad, pad]) since a larger data value should sit higher on
 *  screen, i.e. a smaller pixel y. */
export function scaleLinear(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}
