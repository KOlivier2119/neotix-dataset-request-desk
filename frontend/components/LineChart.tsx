"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export interface Point {
  /** Full label used in the tooltip, e.g. "October 3, 2026". */
  label: string;
  value: number;
  /** Compact axis label; falls back to `label`. */
  short?: string;
}

export interface Series {
  name: string;
  color: string;
  points: Point[];
}

interface Props {
  /** Single-series shorthand (the dashboard). Mutually exclusive with `series`. */
  points?: Point[];
  /** Multi-series data, one line per series. */
  series?: Series[];
  height?: number;
  unit?: string;
  /** Legend with per-series totals; shown automatically for 2+ series. */
  showLegend?: boolean;
  emptyMessage?: string;
}

const PAD = { top: 16, right: 14, bottom: 30, left: 46 };

/** Round an axis maximum up to a human-friendly step (1 / 2 / 2.5 / 5 / 10 × 10ⁿ). */
function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const rawStep = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= niceMax + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

function compact(value: number): string {
  return value >= 10000 ? value.toLocaleString(undefined, { notation: "compact" }) : value.toLocaleString();
}

export default function LineChart({
  points,
  series,
  height = 260,
  unit = "episodes",
  showLegend,
  emptyMessage = "No data for this range.",
}: Props) {
  const gradientId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // Responsive: measure the container instead of assuming a fixed viewBox width.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const allSeries = useMemo<Series[]>(() => {
    if (series && series.length > 0) return series;
    if (points && points.length > 0) return [{ name: unit, color: "#1d1d1f", points }];
    return [];
  }, [series, points, unit]);

  const model = useMemo(() => {
    if (allSeries.length === 0) return null;

    // Union of every label, keeping the caller's order (charts feed sorted days).
    const labels: Point[] = [];
    const seen = new Set<string>();
    for (const s of allSeries) {
      for (const p of s.points) {
        if (seen.has(p.label)) continue;
        seen.add(p.label);
        labels.push(p);
      }
    }
    if (labels.length === 0) return null;

    const visible = allSeries.filter((s) => !hidden.has(s.name));
    const lookup = allSeries.map((s) => {
      const map = new Map<string, number>();
      for (const p of s.points) map.set(p.label, p.value);
      return map;
    });

    // The axis is scaled to the tallest single point, not to series totals —
    // otherwise a long range would flatten every line against the baseline.
    const peak = Math.max(1, ...visible.flatMap((s) => s.points.map((p) => p.value)));
    const ticks = niceTicks(peak);
    const yMax = ticks[ticks.length - 1];

    const innerW = Math.max(1, width - PAD.left - PAD.right);
    const innerH = Math.max(1, height - PAD.top - PAD.bottom);
    const xAt = (i: number) =>
      PAD.left + (labels.length === 1 ? innerW / 2 : (i / (labels.length - 1)) * innerW);
    const yAt = (v: number) => PAD.top + innerH - (Math.min(v, yMax) / yMax) * innerH;

    const lines = allSeries.map((s, si) => {
      const map = lookup[si];
      const path = labels
        .map((p, i) => {
          const v = map.get(p.label) ?? 0;
          return `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`;
        })
        .join(" ");
      const area = `${path} L${xAt(labels.length - 1).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${xAt(0).toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`;
      return { series: s, path, area, total: s.points.reduce((a, p) => a + p.value, 0) };
    });

    return { labels, ticks, yMax, innerW, innerH, xAt, yAt, lines, visible };
  }, [allSeries, hidden, width, height]);

  if (!model) {
    return (
      <div
        ref={wrapRef}
        className="flex items-center justify-center rounded-lg border border-dashed border-black/[0.08] text-sm text-[#6e6e73]"
        style={{ height }}
      >
        {emptyMessage}
      </div>
    );
  }

  const { labels, ticks, innerH, xAt, yAt, lines, visible } = model;
  const visibleLines = lines.filter((l) => !hidden.has(l.series.name));
  const singleSeries = allSeries.length === 1;
  const legend = (showLegend ?? allSeries.length > 1) && allSeries.length > 1;

  // X axis: at most ~6 labels, anchored so they never clip the plot edges.
  const labelStep = Math.max(1, Math.ceil(labels.length / 6));
  const xLabelIndices = labels.map((_, i) => i).filter((i) => i % labelStep === 0 || i === labels.length - 1);

  const hovered = hover !== null ? labels[hover] : null;
  const tooltipLeft = hover !== null ? xAt(hover) : 0;
  const tooltipClamped = Math.min(Math.max(tooltipLeft, 88), Math.max(88, width - 88));

  const onPointerMove = (clientX: number, target: SVGSVGElement) => {
    const rect = target.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * width;
    let best = 0;
    let bestDist = Infinity;
    labels.forEach((_, i) => {
      const d = Math.abs(xAt(i) - x);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setHover(best);
  };

  const totals = lines.map((l) => l.total);
  const peakValue = Math.max(...visible.flatMap((s) => s.points.map((p) => p.value)));
  const ariaLabel = `Line chart of ${unit} across ${labels.length} points. Peak ${peakValue} ${unit}, ${totals.reduce((a, b) => a + b, 0)} total.`;

  return (
    <div ref={wrapRef} className="w-full">
      <div className="relative w-full" style={{ height }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          className="block w-full"
          role="img"
          aria-label={ariaLabel}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => onPointerMove(e.clientX, e.currentTarget)}
          onTouchStart={(e) => onPointerMove(e.touches[0].clientX, e.currentTarget)}
          onTouchMove={(e) => onPointerMove(e.touches[0].clientX, e.currentTarget)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={allSeries[0].color} stopOpacity="0.16" />
              <stop offset="100%" stopColor={allSeries[0].color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Y axis: grid + labels */}
          {ticks.map((t) => {
            const y = yAt(t);
            return (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y}
                  y2={y}
                  stroke={t === 0 ? "rgba(0,0,0,0.14)" : "rgba(0,0,0,0.06)"}
                />
                <text x={PAD.left - 8} y={y + 3} textAnchor="end" fontSize={10} fill="#6e6e73">
                  {compact(t)}
                </text>
              </g>
            );
          })}

          {/* Area fill keeps single-series charts readable at a glance */}
          {singleSeries && visibleLines.length === 1 && (
            <path d={visibleLines[0].area} fill={`url(#${gradientId})`} />
          )}

          {visibleLines.map((l) => (
            <path
              key={l.series.name}
              d={l.path}
              fill="none"
              stroke={l.series.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {/* X axis labels */}
          {xLabelIndices.map((i) => {
            const isEdge = i === 0 || i === labels.length - 1;
            const anchor = labels.length === 1 ? "middle" : i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle";
            return (
              <text
                key={i}
                x={xAt(i)}
                y={height - 10}
                textAnchor={isEdge ? anchor : "middle"}
                fontSize={10}
                fill="#6e6e73"
              >
                {labels[i].short ?? labels[i].label}
              </text>
            );
          })}

          {/* Hover guide + dots */}
          {hover !== null && (
            <g>
              <line
                x1={xAt(hover)}
                x2={xAt(hover)}
                y1={PAD.top}
                y2={PAD.top + innerH}
                stroke="rgba(0,0,0,0.14)"
                strokeDasharray="3 3"
              />
              {visibleLines.map((l) => {
                const value = l.series.points.find((p) => p.label === labels[hover].label)?.value ?? 0;
                return (
                  <circle
                    key={l.series.name}
                    cx={xAt(hover)}
                    cy={yAt(value)}
                    r={4}
                    fill={l.series.color}
                    stroke="#fff"
                    strokeWidth={2}
                  />
                );
              })}
            </g>
          )}
        </svg>

        {/* Tooltip */}
        {hovered && (
          <div
            className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
            style={{ left: tooltipClamped, transform: "translateX(-50%)" }}
          >
            <p className="whitespace-nowrap text-xs text-[#6e6e73]">{hovered.label}</p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {visibleLines.map((l) => {
                const value = l.series.points.find((p) => p.label === hovered.label)?.value ?? 0;
                return (
                  <li key={l.series.name} className="flex items-center justify-between gap-4 whitespace-nowrap">
                    <span className="flex items-center gap-1.5 text-xs text-[#6e6e73]">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: l.series.color }}
                      />
                      {l.series.name}
                    </span>
                    <span className="font-medium">{value.toLocaleString()}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Legend */}
      {legend && (
        <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {lines.map((l) => {
            const off = hidden.has(l.series.name);
            return (
              <li key={l.series.name}>
                <button
                  type="button"
                  onClick={() =>
                    setHidden((prev) => {
                      const next = new Set(prev);
                      if (next.has(l.series.name)) next.delete(l.series.name);
                      // Keep at least one series visible.
                      else if (next.size < allSeries.length - 1) next.add(l.series.name);
                      return next;
                    })
                  }
                  aria-pressed={!off}
                  className={`flex items-center gap-2 text-xs transition-opacity ${
                    off ? "opacity-40" : "opacity-100"
                  }`}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: l.series.color }}
                  />
                  <span className="text-[#6e6e73]">{l.series.name}</span>
                  <span className="font-medium text-[#1d1d1f]">{l.total.toLocaleString()}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
