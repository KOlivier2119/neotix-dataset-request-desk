"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import { ApiError, fetcher } from "@/lib/api";
import type { Analytics, User } from "@/lib/types";
import ErrorBanner from "@/components/ErrorBanner";
import Skeleton from "@/components/Skeleton";
import Table from "@/components/Table";
import LineChart, { type Point, type Series } from "@/components/LineChart";
import BarChart, { type Bar } from "@/components/BarChart";

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Every calendar day in [from, to] as ISO dates (range is capped by the API). */
function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  if (!from || !to || from > to) return days;
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end && days.length < 400) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function shortLabel(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function fullLabel(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const ROBOT_COLORS: Record<string, string> = {
  "arm-01": "#1d1d1f",
  "arm-02": "#007aff",
  "arm-03": "#34c759",
  "mobile-01": "#ff9500",
  "humanoid-01": "#bf5af2",
};

const STATUS_COLORS: Record<string, string> = {
  submitted: "#6e6e73",
  in_progress: "#007aff",
  delivered: "#bf5af2",
  accepted: "#34c759",
  rejected: "#ff3b30",
};

const RANGE_PRESETS = [7, 30, 90];

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-0.5 text-sm text-[#6e6e73]">{label}</p>
      {hint && <p className="text-xs text-[#6e6e73]">{hint}</p>}
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-black/[0.06] bg-white p-5">
      <h2 className="text-lg font-medium">{title}</h2>
      {subtitle && <p className="mb-4 mt-0.5 text-sm text-[#6e6e73]">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      <div>{children}</div>
    </section>
  );
}

export default function AnalyticsPage() {
  const { data: user } = useSWR<User>("/auth/me", fetcher);
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 24 * 3600 * 1000);
  const [from, setFrom] = useState(fmt(monthAgo));
  const [to, setTo] = useState(fmt(today));

  const invalidRange = !from || !to || from > to;
  const key = user && user.role !== "client" && !invalidRange ? `/analytics?from=${from}&to=${to}` : null;
  const { data, error, mutate } = useSWR<Analytics>(key, fetcher);

  const activePreset = RANGE_PRESETS.find(
    (days) => fmt(new Date(new Date(`${to}T00:00:00Z`).getTime() - (days - 1) * 86400000)) === from,
  );

  const charts = useMemo(() => {
    if (!data) return null;
    const days = eachDay(from, to);

    const perRobot = new Map<string, Map<string, number>>();
    const totals = new Map<string, number>();
    for (const row of data.episodes_per_day_per_robot) {
      totals.set(row.day, (totals.get(row.day) ?? 0) + row.count);
      if (!perRobot.has(row.robot_id)) perRobot.set(row.robot_id, new Map());
      perRobot.get(row.robot_id)!.set(row.day, row.count);
    }

    const points: Point[] = days.map((d) => ({
      label: fullLabel(d),
      short: shortLabel(d),
      value: totals.get(d) ?? 0,
    }));

    const series: Series[] = [...perRobot.entries()].map(([robot, counts]) => ({
      name: robot,
      color: ROBOT_COLORS[robot] ?? "#6e6e73",
      points: days.map((d) => ({
        label: fullLabel(d),
        short: shortLabel(d),
        value: counts.get(d) ?? 0,
      })),
    }));

    const statusBars: Bar[] = data.requests_by_status.map((r) => ({
      label: r.status.replace("_", " "),
      value: r.count,
      color: STATUS_COLORS[r.status] ?? "#6e6e73",
    }));

    const taskBars: Bar[] = data.top_tasks_by_good_episodes.map((r) => ({
      label: r.task_name,
      value: r.count,
      color: "#1d1d1f",
    }));

    const busiest = data.episodes_per_day_per_robot.reduce<{ day: string; count: number } | null>(
      (best, row) => {
        const count = totals.get(row.day) ?? 0;
        return !best || count > best.count ? { day: row.day, count } : best;
      },
      null,
    );

    return {
      points,
      series,
      statusBars,
      taskBars,
      totalEpisodes: data.episodes_per_day_per_robot.reduce((a, r) => a + r.count, 0),
      totalRequests: data.requests_by_status.reduce((a, r) => a + r.count, 0),
      busiest,
    };
  }, [data, from, to]);

  if (user && user.role === "client") {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <ErrorBanner message="Analytics is available to operators and admins only." />
      </div>
    );
  }

  const setRange = (days: number) => {
    const start = new Date(new Date(`${to}T00:00:00Z`).getTime() - (days - 1) * 86400000);
    setFrom(fmt(start));
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-[#6e6e73]">Episodes recorded and requests by status over a date range.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-[#6e6e73]">
          <div className="flex items-center gap-1 rounded-md border border-black/[0.08] bg-white p-0.5">
            {RANGE_PRESETS.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setRange(days)}
                className={`rounded px-2.5 py-1 text-xs transition-colors ${
                  activePreset === days ? "bg-[#1d1d1f] text-white" : "hover:bg-black/[0.04]"
                }`}
              >
                {days}d
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2">
            From
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border border-black/[0.08] bg-white px-2 py-1 text-sm text-[#1d1d1f]"
            />
          </label>
          <label className="flex items-center gap-2">
            To
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-md border border-black/[0.08] bg-white px-2 py-1 text-sm text-[#1d1d1f]"
            />
          </label>
        </div>
      </header>

      {invalidRange && (
        <ErrorBanner message="“From” must be on or before “To”." />
      )}

      <ErrorBanner message={error ? (error instanceof ApiError ? error.message : String(error)) : null} onRetry={() => mutate()} />

      {!data && !error && !invalidRange ? (
        <Skeleton className="h-96 w-full" />
      ) : data && charts ? (
        <>
          <section className="grid grid-cols-2 gap-6 border-y border-black/[0.06] py-5 sm:grid-cols-4">
            <Stat label="Episodes recorded" value={charts.totalEpisodes.toLocaleString()} />
            <Stat
              label="Busiest day"
              value={charts.busiest ? charts.busiest.count.toLocaleString() : "—"}
              hint={charts.busiest ? shortLabel(charts.busiest.day) : "no data"}
            />
            <Stat label="Robots active" value={String(charts.series.length)} />
            <Stat
              label="Median hours to delivered"
              value={data.median_hours_submitted_to_delivered === null ? "n/a" : data.median_hours_submitted_to_delivered.toFixed(1)}
              hint={`${charts.totalRequests} requests in range`}
            />
          </section>

          <Card title="Episodes per day" subtitle="Hover the chart for exact counts. Days with no recordings show as 0.">
            <LineChart points={charts.points} unit="episodes" height={240} emptyMessage="No episodes recorded in this range." />
          </Card>

          <Card title="By robot" subtitle="Toggle a robot in the legend to compare series.">
            <LineChart series={charts.series} showLegend unit="episodes" height={240} emptyMessage="No episodes recorded in this range." />
          </Card>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <Card title="Requests by status" subtitle="All requests created inside the range.">
              <BarChart bars={charts.statusBars} emptyMessage="No requests in this range." />
            </Card>
            <Card title="Top tasks by good episodes" subtitle="Ranked by episodes with quality = good.">
              <BarChart bars={charts.taskBars} max={8} emptyMessage="No good-quality episodes in this range." />
            </Card>
          </div>

          <details className="rounded-xl border border-black/[0.06] bg-white p-5">
            <summary className="cursor-pointer text-sm font-medium text-[#007aff]">View raw data tables</summary>
            <div className="mt-5 flex flex-col gap-8">
              <div>
                <h3 className="mb-3 text-sm font-medium">Episodes per day per robot</h3>
                <Table headers={["Day", "Robot", "Count"]}>
                  {data.episodes_per_day_per_robot.map((r, i) => (
                    <tr key={i} className="border-b border-black/[0.04] last:border-0">
                      <td className="py-2 pr-4">{r.day}</td>
                      <td className="py-2 pr-4 text-[#6e6e73]">{r.robot_id}</td>
                      <td className="py-2 pr-4 text-[#6e6e73]">{r.count}</td>
                    </tr>
                  ))}
                </Table>
              </div>
              <div>
                <h3 className="mb-3 text-sm font-medium">Requests by status</h3>
                <Table headers={["Status", "Count"]}>
                  {data.requests_by_status.map((r) => (
                    <tr key={r.status} className="border-b border-black/[0.04] last:border-0">
                      <td className="py-2 pr-4">{r.status.replace("_", " ")}</td>
                      <td className="py-2 pr-4 text-[#6e6e73]">{r.count}</td>
                    </tr>
                  ))}
                </Table>
              </div>
              <div>
                <h3 className="mb-3 text-sm font-medium">Top tasks by good episodes</h3>
                <Table headers={["Task", "Good episodes"]}>
                  {data.top_tasks_by_good_episodes.map((r) => (
                    <tr key={r.task_name} className="border-b border-black/[0.04] last:border-0">
                      <td className="py-2 pr-4">{r.task_name}</td>
                      <td className="py-2 pr-4 text-[#6e6e73]">{r.count}</td>
                    </tr>
                  ))}
                </Table>
              </div>
            </div>
          </details>
        </>
      ) : null}
    </div>
  );
}
