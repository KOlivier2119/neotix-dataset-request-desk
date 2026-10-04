"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { ApiError, fetcher } from "@/lib/api";
import type { Analytics, User } from "@/lib/types";
import ErrorBanner from "@/components/ErrorBanner";
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
  const { data, error } = useSWR<Analytics>(key, fetcher);

  if (user && user.role === "client") {
    return (
      <main className="mx-auto w-full max-w-4xl p-8">
        <ErrorBanner message="Analytics is available to operators and admins only." />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <Link href="/requests" className="underline">Requests</Link>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950" /></label>
        <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950" /></label>
      </div>

      <ErrorBanner message={error ? (error instanceof ApiError ? error.message : String(error)) : null} />

      {data && (
        <>
          <section>
            <h2 className="text-xl font-semibold">Episodes per day per robot</h2>
            <Table headers={["Day", "Robot", "Count"]}>
              {data.episodes_per_day_per_robot.map((r, i) => (
                <tr key={i}>
                  <td className="border-b px-2 py-1">{r.day}</td>
                  <td className="border-b px-2 py-1">{r.robot_id}</td>
                  <td className="border-b px-2 py-1">{r.count}</td>
                </tr>
              ))}
            </Table>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Requests by status</h2>
            <Table headers={["Status", "Count"]}>
              {data.requests_by_status.map((r) => (
                <tr key={r.status}>
                  <td className="border-b px-2 py-1">{r.status}</td>
                  <td className="border-b px-2 py-1">{r.count}</td>
                </tr>
              ))}
            </Table>
            <p className="mt-2 text-sm">
              Median hours submitted → delivered:{" "}
              {data.median_hours_submitted_to_delivered === null
                ? "n/a"
                : data.median_hours_submitted_to_delivered.toFixed(1)}
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Top 5 tasks by good episodes</h2>
            <Table headers={["Task", "Good episodes"]}>
              {data.top_tasks_by_good_episodes.map((r) => (
                <tr key={r.task_name}>
                  <td className="border-b px-2 py-1">{r.task_name}</td>
                  <td className="border-b px-2 py-1">{r.count}</td>
                </tr>
              ))}
            </Table>
          </section>
        </>
      )}
    </main>
  );
}
