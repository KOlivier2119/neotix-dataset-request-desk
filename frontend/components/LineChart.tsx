"use client";

import { useMemo, useState } from "react";

export interface Point {
  label: string; // full date label, e.g. "October 3"
  value: number;
}

export default function LineChart({ points, height = 220 }: { points: Point[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 800;
  const padL = 36;
  const padR = 12;
  const padT = 16;
  const padB = 28;

  const max = Math.max(...points.map((p) => p.value), 1);
  const model = useMemo(() => {
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;
    return points.map((p, i) => ({
      x: padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW),
      y: padT + innerH - (p.value / max) * innerH,
      ...p,
    }));
  }, [points, max, height]);

  const path = model
    .map((m, i) => `${i === 0 ? "M" : "L"}${m.x.toFixed(1)},${m.y.toFixed(1)}`)
    .join(" ");

  const ticks = 4;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * width;
          let best = 0;
          let bestDist = Infinity;
          model.forEach((m, i) => {
            const d = Math.abs(m.x - x);
            if (d < bestDist) {
              bestDist = d;
              best = i;
            }
          });
          setHover(best);
        }}
      >
        {Array.from({ length: ticks }).map((_, i) => {
          const y = padT + ((height - padT - padB) * i) / (ticks - 1);
          const v = Math.round(max * (1 - i / (ticks - 1)));
          return (
            <g key={i}>
              <line x1={padL} x2={width - padR} y1={y} y2={y} stroke="rgba(0,0,0,0.05)" />
              <text x={padL - 8} y={y + 3} textAnchor="end" fontSize={10} fill="#6e6e73">
                {v.toLocaleString()}
              </text>
            </g>
          );
        })}
        {model.length > 1 && (
          <path d={path} fill="none" stroke="#1d1d1f" strokeWidth={1.5} strokeLinejoin="round" />
        )}
        {hover !== null && model[hover] && (
          <g>
            <line x1={model[hover].x} x2={model[hover].x} y1={padT} y2={height - padB} stroke="rgba(0,0,0,0.12)" />
            <circle cx={model[hover].x} cy={model[hover].y} r={3.5} fill="#1d1d1f" stroke="#fff" strokeWidth={2} />
          </g>
        )}
        {model.length > 0 && (
          <>
            <text x={model[0].x} y={height - 8} fontSize={10} fill="#6e6e73">
              {model[0].label}
            </text>
            <text x={model[model.length - 1].x} y={height - 8} fontSize={10} fill="#6e6e73" textAnchor="end">
              {model[model.length - 1].label}
            </text>
          </>
        )}
      </svg>
      {hover !== null && model[hover] && (
        <div className="mt-1 text-sm">
          <span className="text-[#6e6e73]">{model[hover].label}</span>{" · "}
          <span className="font-medium">{model[hover].value.toLocaleString()} episodes</span>
        </div>
      )}
    </div>
  );
}
