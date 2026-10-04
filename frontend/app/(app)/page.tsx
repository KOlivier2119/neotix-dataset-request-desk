"use client";

import Link from "next/link";
import useSWR from "swr";
import { useState } from "react";
import { api, ApiError, fetcher } from "@/lib/api";
import type { Analytics, RequestItem, User } from "@/lib/types";
import ErrorBanner from "@/components/ErrorBanner";
import StatusBadge from "@/components/StatusBadge";
import Button from "@/components/Button";
import Skeleton from "@/components/Skeleton";
import LineChart from "@/components/LineChart";
import Table from "@/components/Table";
import Toast from "@/components/Toast";

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-[#6e6e73]/30",
  in_progress: "bg-[#007aff]",
  delivered: "bg-[#bf5af2]",
  accepted: "bg-[#34c759]",
  rejected: "bg-[#ff3b30]",
};

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export default function DashboardPage() {
  const { data: user, error: userError, mutate: mutateUser } = useSWR<User>("/auth/me", fetcher);
  const { data: requests, error: reqError, mutate: mutateRequests } = useSWR<RequestItem[]>("/requests", fetcher);

  const today = new Date();
  const from = new Date(today.getTime() - 29 * 24 * 3600 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const canSeeOps = user && user.role !== "client";
  const { data: analytics } = useSWR<Analytics>(
    canSeeOps ? `/analytics?from=${fmt(from)}&to=${fmt(today)}` : null,
    fetcher,
  );

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = user?.name?.split(" ")[0] ?? "there";

  const needsAttention = (requests ?? []).filter((r) => {
    if (r.status === "delivered") return true;
    if (r.status === "rejected") return true;
    if (r.status === "in_progress" || r.status === "submitted") {
      const days = (new Date(r.deadline).getTime() - now.getTime()) / (24 * 3600 * 1000);
      return days <= 7;
    }
    return false;
  });

  const episodesByDay = new Map<string, number>();
  for (const row of analytics?.episodes_per_day_per_robot ?? []) {
    episodesByDay.set(row.day, (episodesByDay.get(row.day) ?? 0) + row.count);
  }
  const chartPoints = Array.from(episodesByDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, count]) => ({
      label: new Date(day + "T00:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric" }),
      value: count,
    }));
  const totalEpisodes = [...episodesByDay.values()].reduce((a, b) => a + b, 0);
  const todayKey = fmt(today);
  const episodesToday = episodesByDay.get(todayKey) ?? 0;

  const deliveredCount = (requests ?? []).filter((r) => r.status === "delivered").length;
  const thisWeek = (requests ?? []).filter(
    (r) => (now.getTime() - new Date(r.created_at).getTime()) / (24 * 3600 * 1000) <= 7,
  ).length;

  const [toast, setToast] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const isClient = user?.role === "client";

  // Create request inline (client)
  const [taskName, setTaskName] = useState("");
  const [episodesRequested, setEpisodesRequested] = useState("10");
  const [deadline, setDeadline] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function createRequest(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      await api("/requests", {
        method: "POST",
        body: JSON.stringify({
          task_name: taskName,
          episodes_requested: Number(episodesRequested),
          deadline: new Date(deadline).toISOString(),
          notes: notes || null,
        }),
      });
      setCreateOpen(false);
      setToast("Request created");
      mutateRequests();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not create request");
    }
  }

  const statusCounts = ["submitted", "in_progress", "delivered", "accepted", "rejected"].map((s) => ({
    status: s,
    count: (requests ?? []).filter((r) => r.status === s).length,
  }));
  const totalStatus = statusCounts.reduce((a, s) => a + s.count, 0) || 1;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 p-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          {greeting}, {firstName}.
        </h1>
        <p className="mt-1 text-sm text-[#6e6e73]">
          {needsAttention.length > 0
            ? `${needsAttention.length} request${needsAttention.length === 1 ? "" : "s"} need${needsAttention.length === 1 ? "s" : ""} your attention.`
            : "Operations are looking healthy."}
        </p>
      </header>

      <ErrorBanner
        message={userError ? "Unable to load your account. Check your connection and try again." : null}
        onRetry={userError ? () => mutateUser() : undefined}
      />

      {/* KPI area */}
      <section className="grid grid-cols-1 gap-6 border-y border-black/[0.06] py-6 sm:grid-cols-3">
        <div>
          <p className="text-4xl font-semibold tracking-tight">{requests?.length ?? <Skeleton className="h-9 w-16" />}</p>
          <p className="mt-1 text-sm text-[#6e6e73]">Requests</p>
          <p className="text-xs text-[#6e6e73]">+{thisWeek} this week</p>
        </div>
        <div className="sm:border-l sm:border-black/[0.06] sm:pl-6">
          <p className="text-4xl font-semibold tracking-tight">{canSeeOps ? totalEpisodes.toLocaleString() : "—"}</p>
          <p className="mt-1 text-sm text-[#6e6e73]">Episodes</p>
          <p className="text-xs text-[#6e6e73]">{episodesToday.toLocaleString()} recorded today</p>
        </div>
        <div className="sm:border-l sm:border-black/[0.06] sm:pl-6">
          <p className="text-4xl font-semibold tracking-tight">{deliveredCount}</p>
          <p className="mt-1 text-sm text-[#6e6e73]">Delivered</p>
          <p className="text-xs text-[#6e6e73]">awaiting review</p>
        </div>
      </section>

      <ErrorBanner
        message={reqError ? "Unable to load requests. Check your connection and try again." : null}
        onRetry={reqError ? () => mutateRequests() : undefined}
      />

      {/* Main analytics area */}
      {canSeeOps && (
        <section className="grid grid-cols-1 gap-10 lg:grid-cols-[2fr_1fr]">
          <div>
            <h2 className="mb-4 text-lg font-medium">Episodes recorded</h2>
            {chartPoints.length > 0 ? (
              <LineChart points={chartPoints} />
            ) : (
              <Skeleton className="h-[220px] w-full" />
            )}
          </div>
          <div>
            <h2 className="mb-4 text-lg font-medium">Request status</h2>
            <div className="flex h-3 w-full overflow-hidden rounded-full">
              {statusCounts.map((s) =>
                s.count > 0 ? (
                  <div
                    key={s.status}
                    className={`${STATUS_COLORS[s.status]} h-full`}
                    style={{ width: `${(s.count / totalStatus) * 100}%` }}
                  />
                ) : null,
              )}
            </div>
            <ul className="mt-4 flex flex-col gap-2">
              {statusCounts.map((s) => (
                <li key={s.status} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-[#6e6e73]">
                    <span className={`inline-block h-2 w-2 rounded-full ${STATUS_COLORS[s.status]}`} />
                    {s.status.replace("_", " ")}
                  </span>
                  <span className="font-medium">{s.count}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Needs attention */}
      <section>
        <h2 className="mb-3 text-lg font-medium">Needs attention</h2>
        {needsAttention.length === 0 ? (
          <p className="text-sm text-[#6e6e73]">Nothing needs attention right now.</p>
        ) : (
          <ul className="divide-y divide-black/[0.05] border-y border-black/[0.06]">
            {needsAttention.slice(0, 6).map((r) => {
              const remaining = Math.max(0, r.episodes_requested - r.assigned_count);
              const days = (new Date(r.deadline).getTime() - now.getTime()) / (24 * 3600 * 1000);
              const reason =
                r.status === "delivered"
                  ? "Awaiting review"
                  : r.status === "rejected"
                    ? "In rework"
                    : r.status === "submitted"
                      ? "Not started"
                      : days <= 3
                        ? "Deadline approaching"
                        : "In progress";
              return (
                <li key={r.id}>
                  <Link
                    href={`/requests/${r.id}`}
                    className="group flex items-center justify-between px-2 py-3 transition-colors duration-150 hover:bg-black/[0.03]"
                  >
                    <div>
                      <p className="text-sm font-medium">{r.task_name}</p>
                      <p className="text-xs text-[#6e6e73]">
                        {r.assigned_count} / {r.episodes_requested} episodes
                      </p>
                    </div>
                    <div className="flex items-center gap-6">
                      <span className="text-xs text-[#6e6e73]">
                        {days < 0 ? "Overdue" : days < 1 ? "Deadline today" : `Deadline in ${Math.ceil(days)}d`}
                      </span>
                      <span className="text-xs text-[#6e6e73]">{remaining} remaining</span>
                      <span className="text-sm text-[#6e6e73] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                        Open →
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Recent requests */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">Recent requests</h2>
          <Link href="/requests" className="text-sm text-[#007aff] hover:underline">
            View all →
          </Link>
        </div>
        <Table headers={["Request", "Client", "Progress", "Deadline", "Status"]}>
          {(requests ?? []).slice(0, 8).map((r) => (
            <tr key={r.id} className="border-b border-black/[0.04] last:border-0">
              <td className="py-2.5 pr-4">
                <Link href={`/requests/${r.id}`} className="font-medium hover:underline">
                  {r.title}
                </Link>
              </td>
              <td className="py-2.5 pr-4 text-[#6e6e73]">{r.client_name || `#${r.client_id}`}</td>
              <td className="py-2.5 pr-4 text-[#6e6e73]">
                {r.assigned_count} / {r.episodes_requested}
              </td>
              <td className="py-2.5 pr-4 text-[#6e6e73]">{new Date(r.deadline).toLocaleDateString()}</td>
              <td className="py-2.5 pr-4">
                <StatusBadge status={r.status} />
              </td>
            </tr>
          ))}
        </Table>
      </section>

      {isClient && (
        <section>
          {!createOpen ? (
            <Button onClick={() => setCreateOpen(true)}>Create request</Button>
          ) : (
            <form onSubmit={createRequest} className="flex max-w-lg flex-col gap-3">
              <h2 className="text-lg font-medium">New request</h2>
              <ErrorBanner message={formError} />
              <input className="rounded-md border border-black/[0.08] bg-white px-3 py-2 text-sm outline-none focus:border-black/20" placeholder="Task name" value={taskName} onChange={(e) => setTaskName(e.target.value)} required />
              <input className="rounded-md border border-black/[0.08] bg-white px-3 py-2 text-sm outline-none focus:border-black/20" type="number" min={1} value={episodesRequested} onChange={(e) => setEpisodesRequested(e.target.value)} required />
              <input className="rounded-md border border-black/[0.08] bg-white px-3 py-2 text-sm outline-none focus:border-black/20" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} required />
              <textarea className="rounded-md border border-black/[0.08] bg-white px-3 py-2 text-sm outline-none focus:border-black/20" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
              <div className="flex gap-2">
                <Button type="submit">Create</Button>
                <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>Cancel</Button>
              </div>
            </form>
          )}
        </section>
      )}

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
