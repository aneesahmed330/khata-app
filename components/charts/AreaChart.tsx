"use client";

import { useId, useMemo, useRef, useState } from "react";
import { linePath, areaPath, scaleLinear, niceTicks, compactNumber } from "@/lib/chart";
import { formatPKR } from "@/lib/format";
import { useHideBalances } from "@/lib/use-hide-balances";

export interface AreaPoint {
  /** Sparse x-axis text, e.g. "1", "15" */
  label: string;
  /** Full date for the tooltip, e.g. "15 Jul" */
  fullLabel: string;
  value: number;
}

const VB_W = 340;
const GUTTER = 30; // room for y-axis labels, in viewBox units
const PAD_R = 4;
const PAD_TOP = 12;

/** Single-series trend, one hue. Upgrade over the old TrendChart: a real
 *  y-axis (snapped ticks + compact labels) so the shape is readable as
 *  magnitude rather than just direction, plus the hover crosshair the dataviz
 *  skill ships by default on line/area. Pointer Events cover mouse and touch
 *  identically, so there's no separate touch path. */
export function AreaChart({
  points,
  height = 168,
  ariaLabel,
}: {
  points: AreaPoint[];
  height?: number;
  ariaLabel: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gradientId = useId();
  const [hideBalances] = useHideBalances();

  const rawMax = Math.max(...points.map((p) => p.value), 1);
  const ticks = useMemo(() => niceTicks(rawMax, 3), [rawMax]);
  const axisMax = ticks[ticks.length - 1] || 1;

  const baseline = height - 18;
  const xScale = scaleLinear([0, Math.max(points.length - 1, 1)], [GUTTER, VB_W - PAD_R]);
  const yScale = scaleLinear([0, axisMax], [baseline, PAD_TOP]);

  const coords = useMemo(
    () => points.map((p, i) => ({ x: xScale(i), y: yScale(p.value) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, axisMax, height],
  );

  function handlePointer(clientX: number) {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return;
    const rect = svg.getBoundingClientRect();
    // Map client x into the plot area only, so the first/last point stay
    // reachable instead of needing an off-chart drag.
    const plotLeft = rect.left + (GUTTER / VB_W) * rect.width;
    const plotWidth = ((VB_W - PAD_R - GUTTER) / VB_W) * rect.width;
    const fraction = (clientX - plotLeft) / plotWidth;
    const idx = Math.round(fraction * (points.length - 1));
    setHoverIndex(Math.min(points.length - 1, Math.max(0, idx)));
  }

  if (points.length < 2) return null;

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const hoveredCoord = hoverIndex !== null ? coords[hoverIndex] : null;

  // Sparse x labels only — first, middle, last. Never one per point.
  const labelIdx = [0, Math.floor((points.length - 1) / 2), points.length - 1];

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${height}`}
        className="w-full touch-none select-none overflow-visible"
        style={{ height }}
        onPointerMove={(e) => handlePointer(e.clientX)}
        onPointerDown={(e) => handlePointer(e.clientX)}
        onPointerLeave={() => setHoverIndex(null)}
        role="img"
        aria-label={ariaLabel}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--k-chart-mag)" stopOpacity={0.26} />
            <stop offset="100%" stopColor="var(--k-chart-mag)" stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Recessive gridlines + y labels. Solid hairlines, never dashed. */}
        {ticks.map((t) => {
          const y = yScale(t);
          return (
            <g key={t}>
              <line
                x1={GUTTER}
                x2={VB_W - PAD_R}
                y1={y}
                y2={y}
                className={t === 0 ? "stroke-rule" : "stroke-rule-soft"}
                strokeWidth={1}
              />
              <text
                x={GUTTER - 6}
                y={y + 3}
                textAnchor="end"
                className="tnum fill-fg-faint font-num"
                style={{ fontSize: 9 }}
              >
                {hideBalances ? "···" : compactNumber(t)}
              </text>
            </g>
          );
        })}

        <path d={areaPath(coords, baseline)} fill={`url(#${gradientId})`} />
        <path
          d={linePath(coords)}
          fill="none"
          className="stroke-chart-mag"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {hoveredCoord ? (
          <>
            <line
              x1={hoveredCoord.x}
              x2={hoveredCoord.x}
              y1={PAD_TOP}
              y2={baseline}
              className="stroke-fg-faint"
              strokeWidth={1}
            />
            {/* 2px surface ring so the dot reads against both line and wash */}
            <circle
              cx={hoveredCoord.x}
              cy={hoveredCoord.y}
              r={4}
              className="fill-chart-mag stroke-surface-lift"
              strokeWidth={2}
            />
          </>
        ) : null}

        {labelIdx.map((i) => (
          <text
            key={i}
            x={coords[i]!.x}
            y={height - 4}
            textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
            className="tnum fill-fg-faint font-num"
            style={{ fontSize: 9 }}
          >
            {points[i]!.label}
          </text>
        ))}
      </svg>

      {hovered ? (
        <div
          className="pointer-events-none absolute z-10 rounded-[4px] border border-rule bg-surface px-2 py-1"
          style={{
            left: `${Math.min(90, Math.max(10, (hoveredCoord!.x / VB_W) * 100))}%`,
            top: `${((hoveredCoord!.y - 10) / height) * 100}%`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="t-micro whitespace-nowrap text-fg-faint">{hovered.fullLabel}</div>
          <div className="tnum whitespace-nowrap font-num text-[13px] text-fg">
            {hideBalances ? "••••••" : formatPKR(hovered.value)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
