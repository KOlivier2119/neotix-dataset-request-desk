"use client";

export interface Bar {
  label: string;
  value: number;
  /** Defaults to the ink colour. */
  color?: string;
  /** Secondary line under the label (e.g. share of total). */
  hint?: string;
}

interface Props {
  bars: Bar[];
  /** Formats the numeric column; defaults to a plain locale string. */
  format?: (value: number) => string;
  emptyMessage?: string;
  /** Cap on visible rows; the rest collapse into a single "…" row. */
  max?: number;
}

/**
 * Horizontal bar chart: labels stay readable, values line up in a column, and
 * the bars animate to width so a range change reads as a change rather than a
 * jump. Used for the ranked/categorical analytics panels.
 */
export default function BarChart({ bars, format, emptyMessage = "No data for this range.", max }: Props) {
  if (bars.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-black/[0.08] text-sm text-[#6e6e73]">
        {emptyMessage}
      </div>
    );
  }

  const shown = max ? bars.slice(0, max) : bars;
  const hiddenTotal = max && bars.length > max ? bars.slice(max).reduce((a, b) => a + b.value, 0) : 0;
  const total = bars.reduce((a, b) => a + b.value, 0);
  const peak = Math.max(...bars.map((b) => b.value), 1);
  const fmt = format ?? ((v: number) => v.toLocaleString());

  const rows: Bar[] = [...shown];
  if (hiddenTotal > 0) rows.push({ label: `+${bars.length - shown.length} more`, value: hiddenTotal, color: "#c7c7cc" });

  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((b, i) => {
        const share = total > 0 ? Math.round((b.value / total) * 100) : 0;
        const color = b.color ?? "#1d1d1f";
        return (
          <li key={`${b.label}-${i}`} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3">
            <span className="truncate text-sm" title={b.label}>
              {b.label}
              {b.hint && <span className="block truncate text-xs text-[#6e6e73]">{b.hint}</span>}
            </span>
            <span className="h-6 w-full overflow-hidden rounded-md bg-black/[0.04]">
              <span
                className="block h-full rounded-md transition-[width] duration-500 ease-out"
                style={{ width: `${Math.max(2, (b.value / peak) * 100)}%`, backgroundColor: color }}
              />
            </span>
            <span className="w-24 text-right text-sm tabular-nums">
              {fmt(b.value)}
              {total > 0 && <span className="ml-1.5 text-xs text-[#6e6e73]">{share}%</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
