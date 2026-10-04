"use client";

import useSWR from "swr";
import { useState } from "react";
import { ApiError, fetcher } from "@/lib/api";
import type { Analytics, User } from "@/lib/types";
import ErrorBanner from "@/components/ErrorBanner";
import Skeleton from "@/components/Skeleton";
import Table from "@/components/Table";

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function AnalyticsPage() {
  const { data: user } = useSWR<User>("/auth/me", fetcher);
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 24 * 3600 * 1000);
  const [from, setFrom] = useState(fmt(monthAgo));
  const [to, setTo] = useState(fmt(today));

  const key = user && user.role !== "client" ? `/analytics?from=${from}&to=${to}` : null;
  const { data, error, mutate } = useSWR<Analytics>(key, fetcher);

  if (user && user.role === "client") {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <ErrorBanner message="Analytics is available to operators and admins only." />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 p-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Analytics</h1>
      </header>

      <div className="flex items-center gap-3 text-sm text-[#6e6e73]">
        <label className="flex items-center gap-2">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-black/[0.08] bg-white px-2 py-1 text-sm text-[#1d1d1f]" />
        </label>
        <label className="flex items-center gap-2">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-black/[0.08] bg-white px-2 py-1 text-sm text-[#1d1d1f]" />
        </label>
      </div>

      <ErrorBanner message={error ? (error instanceof ApiError ? error.message : String(error)) : null} onRetry={() => mutate()} />

      {!data && !error ? (
        <Skeleton className="h-64 w-full" />
      ) : data ? (
        <>
          <section>
            <h2 className="mb-3 text-lg font-medium">Episodes per day per robot</h2>
            <Table headers={["Day", "Robot", "Count"]}>
              {data.episodes_per_day_per_robot.map((r, i) => (
                <tr key={i} className="border-b border-black/[0.04] last:border-0">
                  <td className="py-2 pr-4">{r.day}</td>
                  <td className="py-2 pr-4 text-[#6e6e73]">{r.robot_id}</td>
                  <td className="py-2 pr-4 text-[#6e6e73]">{r.count}</td>
                </tr>
              ))}
            </Table>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-medium">Requests</h2>
            <Table headers={["Status", "Count"]}>
              {data.requests_by_status.map((r) => (
                <tr key={r.status} className="border-b border-black/[0.04] last:border-0">
                  <td className="py-2 pr-4">{r.status.replace("_", " ")}</td>
                  <td className="py-2 pr-4 text-[#6e6e73]">{r.count}</td>
                </tr>
              ))}
            </Table>
            <p className="mt-3 text-sm text-[#6e6e73]">
              Median hours submitted → delivered:{" "}
              <span className="font-medium text-[#1d1d1f]">
                {data.median_hours_submitted_to_delivered === null ? "n/a" : data.median_hours_submitted_to_delivered.toFixed(1)}
              </span>
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-medium">Top tasks by good episodes</h2>
            <Table headers={["Task", "Good episodes"]}>
              {data.top_tasks_by_good_episodes.map((r) => (
                <tr key={r.task_name} className="border-b border-black/[0.04] last:border-0">
                  <td className="py-2 pr-4">{r.task_name}</td>
                  <td className="py-2 pr-4 text-[#6e6e73]">{r.count}</td>
                </tr>
              ))}
            </Table>
          </section>
        </>
      ) : null}
    </div>
  );
}
