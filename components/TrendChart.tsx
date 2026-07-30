"use client";

import { useId, useMemo, useRef, useState } from "react";
import { linePath, areaPath, scaleLinear } from "@/lib/chart";
import { formatPKR } from "@/lib/format";

export interface TrendPoint {
  /** Sparse x-axis text, e.g. "1", "15" */
  label: string;
  /** Full date for the tooltip, e.g. "15 Jul" */
  fullLabel: string;
  value: number;
}

const WIDTH = 320;
const HEIGHT = 160;
const PAD_X = 6;
const PAD_TOP = 16;
const PAD_BOTTOM = 8;

/** Daily trend line — one hue, hairline gridlines, hover crosshair + tooltip
 *  (dataviz skill: hover ships by default on line/area). Pointer Events cover
 *  mouse and touch identically, so no separate touch handling is needed. */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gradientId = useId();

  const maxValue = Math.max(...points.map((p) => p.value), 1);
  const baseline = HEIGHT - PAD_BOTTOM;
  const xScale = scaleLinear([0, Math.max(points.length - 1, 1)], [PAD_X, WIDTH - PAD_X]);
  const yScale = scaleLinear([0, maxValue], [baseline, PAD_TOP]);

  const coords = useMemo(
    () => points.map((p, i) => ({ x: xScale(i), y: yScale(p.value) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, maxValue],
  );

  function handlePointer(clientX: number) {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const fraction = (clientX - rect.left) / rect.width;
    const idx = Math.round(fraction * (points.length - 1));
    setHoverIndex(Math.min(points.length - 1, Math.max(0, idx)));
  }

  if (points.length < 2) return null;

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const hoveredCoord = hoverIndex !== null ? coords[hoverIndex] : null;

  // Sparse labels only — first, middle, last (dataviz skill: never one label
  // per point).
  const labelIndexes = new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]);
  const tooltipLeftPct = hoveredCoord
    ? Math.min(88, Math.max(12, (hoveredCoord.x / WIDTH) * 100))
    : 0;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full touch-none select-none"
        style={{ height: HEIGHT }}
        onPointerMove={(e) => handlePointer(e.clientX)}
        onPointerDown={(e) => handlePointer(e.clientX)}
        onPointerLeave={() => setHoverIndex(null)}
        role="img"
        aria-label="Daily spending this month"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-chart-mag)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--color-chart-mag)" stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* hairline gridlines — solid, never dashed */}
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={PAD_X}
            x2={WIDTH - PAD_X}
            y1={PAD_TOP + f * (baseline - PAD_TOP)}
            y2={PAD_TOP + f * (baseline - PAD_TOP)}
            style={{ stroke: "var(--color-rule)" }}
            strokeWidth={1}
          />
        ))}

        {/* area wash — one hue, gradient fade toward the baseline */}
        <path d={areaPath(coords, baseline)} fill={`url(#${gradientId})`} />

        {/* the line — 2px, round join, no smoothing */}
        <path
          d={linePath(coords)}
          fill="none"
          style={{ stroke: "var(--color-chart-mag)" }}
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
              style={{ stroke: "var(--color-rule)" }}
              strokeWidth={1}
            />
            <circle
              cx={hoveredCoord.x}
              cy={hoveredCoord.y}
              r={4}
              style={{ fill: "var(--color-chart-mag)", stroke: "var(--color-surface-lift)" }}
              strokeWidth={2}
            />
          </>
        ) : null}
      </svg>

      <div className="mt-1 flex justify-between px-1" aria-hidden>
        {points.map((p, i) =>
          labelIndexes.has(i) ? (
            <span key={i} className="t-micro text-fg-faint">
              {p.label}
            </span>
          ) : (
            <span key={i} />
          ),
        )}
      </div>

      {hovered ? (
        <div
          className="pointer-events-none absolute rounded-[4px] border border-rule bg-surface px-2 py-1"
          style={{
            left: `${tooltipLeftPct}%`,
            top: `${((hoveredCoord!.y - 8) / HEIGHT) * 100}%`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="t-micro text-fg-faint">{hovered.fullLabel}</div>
          <div className="tnum font-num text-[13px] text-fg">{formatPKR(hovered.value)}</div>
        </div>
      ) : null}
    </div>
  );
}
