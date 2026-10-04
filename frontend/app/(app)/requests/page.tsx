"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import useSWR from "swr";
import { api, ApiError, fetcher } from "@/lib/api";
import type { RequestItem, User } from "@/lib/types";
import Button from "@/components/Button";
import ErrorBanner from "@/components/ErrorBanner";
import StatusBadge from "@/components/StatusBadge";
import Skeleton from "@/components/Skeleton";
import Toast from "@/components/Toast";

const STATUSES = ["", "submitted", "in_progress", "delivered", "accepted", "rejected"];

function RequestsBody() {
  const { data: user } = useSWR<User>("/auth/me", fetcher);
  const params = useSearchParams();
  const isClient = user?.role === "client";
  const [statusFilter, setStatusFilter] = useState("");
  const key = user ? (isClient || !statusFilter ? "/requests" : `/requests?status=${statusFilter}`) : null;
  const { data: requests, error, mutate } = useSWR<RequestItem[]>(key, fetcher);

  const [createOpen, setCreateOpen] = useState(params.get("new") === "1");
  const [taskName, setTaskName] = useState("");
  const [episodesRequested, setEpisodesRequested] = useState("10");
  const [deadline, setDeadline] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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
      mutate();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not create request");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-8">
      <header className="flex items-end justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Requests</h1>
        {isClient && (
          <Button onClick={() => setCreateOpen((o) => !o)}>{createOpen ? "Cancel" : "New request"}</Button>
        )}
      </header>

      {!isClient && user && (
        <div className="flex items-center gap-2 text-sm text-[#6e6e73]">
          <span>Status</span>
          <select
            className="rounded-md border border-black/[0.08] bg-white px-2 py-1 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s ? s.replace("_", " ") : "all"}</option>
            ))}
          </select>
        </div>
      )}

      <ErrorBanner
        message={error ? "Unable to load requests. Check your connection and try again." : null}
        onRetry={() => mutate()}
      />

      {!requests && !error ? (
        <Skeleton className="h-40 w-full" />
      ) : requests && requests.length === 0 ? (
        <div className="border-t border-black/[0.06] pt-6 text-sm text-[#6e6e73]">
          {isClient ? (
            <>
              No requests yet.
              <br />
              Create your first dataset request to get started.
            </>
          ) : (
            "No requests match this filter."
          )}
        </div>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {["Request", "Client", "Progress", "Deadline", "Status"].map((h) => (
                <th key={h} className="border-b border-black/[0.06] pb-2 pr-4 text-left text-xs font-medium uppercase tracking-wide text-[#6e6e73]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(requests ?? []).map((r) => (
              <tr key={r.id} className="border-b border-black/[0.04] last:border-0">
                <td className="py-2.5 pr-4">
                  <Link href={`/requests/${r.id}`} className="font-medium hover:underline">{r.title}</Link>
                </td>
                <td className="py-2.5 pr-4 text-[#6e6e73]">{r.client_name || `#${r.client_id}`}</td>
                <td className="py-2.5 pr-4 text-[#6e6e73]">{r.assigned_count} / {r.episodes_requested}</td>
                <td className="py-2.5 pr-4 text-[#6e6e73]">{new Date(r.deadline).toLocaleDateString()}</td>
                <td className="py-2.5 pr-4"><StatusBadge status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {isClient && createOpen && (
        <section className="max-w-lg">
          <h2 className="mb-3 text-lg font-medium">New request</h2>
          <ErrorBanner message={formError} />
          <form onSubmit={createRequest} className="flex flex-col gap-3">
            <input className="rounded-md border border-black/[0.08] bg-white px-3 py-2 text-sm outline-none focus:border-black/20" placeholder="Task name" value={taskName} onChange={(e) => setTaskName(e.target.value)} required />
            <input className="rounded-md border border-black/[0.08] bg-white px-3 py-2 text-sm outline-none focus:border-black/20" type="number" min={1} value={episodesRequested} onChange={(e) => setEpisodesRequested(e.target.value)} required />
            <input className="rounded-md border border-black/[0.08] bg-white px-3 py-2 text-sm outline-none focus:border-black/20" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} required />
            <textarea className="rounded-md border border-black/[0.08] bg-white px-3 py-2 text-sm outline-none focus:border-black/20" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button type="submit">Create request</Button>
          </form>
        </section>
      )}

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

export default function RequestsPage() {
  return (
    <Suspense fallback={<div className="p-8"><Skeleton className="h-40 w-full" /></div>}>
      <RequestsBody />
    </Suspense>
  );
}
