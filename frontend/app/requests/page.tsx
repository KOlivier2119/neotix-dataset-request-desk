"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { api, ApiError, fetcher } from "@/lib/api";
import type { RequestItem, User } from "@/lib/types";
import Button from "@/components/Button";
import ErrorBanner from "@/components/ErrorBanner";
import StatusBadge from "@/components/StatusBadge";

const STATUSES = ["", "submitted", "in_progress", "delivered", "accepted", "rejected"];

export default function RequestsPage() {
  const { data: user } = useSWR<User>("/auth/me", fetcher);
  const [statusFilter, setStatusFilter] = useState("");
  const isClient = user?.role === "client";
  const key = user ? (isClient || !statusFilter ? "/requests/" : `/requests/?status=${statusFilter}`) : null;
  const { data: requests, error, mutate } = useSWR<RequestItem[]>(key, fetcher);

  const [taskName, setTaskName] = useState("");
  const [episodesRequested, setEpisodesRequested] = useState("10");
  const [deadline, setDeadline] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function createRequest(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      await api("/requests/", {
        method: "POST",
        body: JSON.stringify({
          task_name: taskName,
          episodes_requested: Number(episodesRequested),
          deadline: new Date(deadline).toISOString(),
          notes: notes || null,
        }),
      });
      setTaskName("");
      setEpisodesRequested("10");
      setDeadline("");
      setNotes("");
      mutate();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not create request");
    }
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Requests</h1>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/requests" className="underline">Requests</Link>
          {user && user.role !== "client" && (
            <Link href="/analytics" className="underline">Analytics</Link>
          )}
          <button onClick={logout} className="underline">Log out</button>
        </div>
      </div>

      {!isClient && user && (
        <label className="flex items-center gap-2 text-sm">
          Status filter:
          <select
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s || "all"}</option>
            ))}
          </select>
        </label>
      )}

      <ErrorBanner message={error ? (error instanceof ApiError ? error.message : String(error)) : null} />

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border-b px-2 py-1 text-left">ID</th>
            <th className="border-b px-2 py-1 text-left">Task</th>
            <th className="border-b px-2 py-1 text-left">Episodes</th>
            <th className="border-b px-2 py-1 text-left">Deadline</th>
            <th className="border-b px-2 py-1 text-left">Status</th>
          </tr>
        </thead>
        <tbody>
          {(requests ?? []).map((r) => (
            <tr key={r.id}>
              <td className="border-b px-2 py-1">
                <Link href={`/requests/${r.id}`} className="underline">{r.id}</Link>
              </td>
              <td className="border-b px-2 py-1">{r.task_name}</td>
              <td className="border-b px-2 py-1">{r.episodes_requested}</td>
              <td className="border-b px-2 py-1">{new Date(r.deadline).toLocaleDateString()}</td>
              <td className="border-b px-2 py-1"><StatusBadge status={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      {isClient && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">New request</h2>
          <ErrorBanner message={formError} />
          <form onSubmit={createRequest} className="flex flex-col gap-2">
            <input
              className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              placeholder="Task name (e.g. pick cup)"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              required
            />
            <input
              className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              type="number"
              min={1}
              placeholder="Episodes requested"
              value={episodesRequested}
              onChange={(e) => setEpisodesRequested(e.target.value)}
              required
            />
            <input
              className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              required
            />
            <textarea
              className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              placeholder="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <Button type="submit">Create request</Button>
          </form>
        </section>
      )}
    </main>
  );
}
