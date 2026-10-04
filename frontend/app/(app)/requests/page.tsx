"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import useSWR from "swr";
import { api, ApiError, fetcher } from "@/lib/api";
import type { RequestItem, User } from "@/lib/types";
import { REQUEST_STATUSES } from "@/lib/constants";
import { useDebounced } from "@/lib/useDebounced";
import Button from "@/components/Button";
import ErrorBanner from "@/components/ErrorBanner";
import StatusBadge from "@/components/StatusBadge";
import Skeleton from "@/components/Skeleton";
import Pagination from "@/components/Pagination";
import Toast from "@/components/Toast";
import { FilterBar, FilterSelect, SearchInput } from "@/components/Filters";

const PAGE_SIZE = 10;

function RequestsBody() {
  const { data: user } = useSWR<User>("/auth/me", fetcher);
  const params = useSearchParams();
  const router = useRouter();
  const isClient = user?.role === "client";

  // Filters live in the URL so a refresh or a shared link keeps the same view.
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState(params.get("status") ?? "");
  const [page, setPage] = useState(Math.max(0, Number(params.get("page") ?? "1") - 1));

  // Searching happens server-side (title, task, notes and client), so the key
  // only changes once the user pauses typing.
  const term = useDebounced(search);
  const activeFilters = [term, isClient ? "" : statusFilter].filter(Boolean).length;

  useEffect(() => {
    const next = new URLSearchParams();
    if (term) next.set("q", term);
    if (!isClient && statusFilter) next.set("status", statusFilter);
    if (page > 0) next.set("page", String(page + 1));
    if (next.toString() !== params.toString()) {
      router.replace(next.toString() ? `?${next.toString()}` : "/requests", { scroll: false });
    }
  }, [term, statusFilter, page, isClient, params, router]);

  const query = new URLSearchParams();
  if (term) query.set("q", term);
  if (!isClient && statusFilter) query.set("status", statusFilter);
  query.set("limit", String(PAGE_SIZE + 1));
  query.set("offset", String(page * PAGE_SIZE));
  const key = user ? `/requests?${query.toString()}` : null;
  const { data: requests, error, mutate, isLoading } = useSWR<RequestItem[]>(key, fetcher);
  // The API returns one extra row so we know whether another page exists.
  const rows = (requests ?? []).slice(0, PAGE_SIZE);
  const hasMore = (requests ?? []).length > PAGE_SIZE;

  function clearFilters() {
    setSearch("");
    setStatusFilter("");
    setPage(0);
  }

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
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Requests</h1>
          <p className="mt-1 text-sm text-[#6e6e73]">Search by title, task, notes or client — 10 per page.</p>
        </div>
        {isClient && (
          <Button onClick={() => setCreateOpen((o) => !o)}>{createOpen ? "Cancel" : "New request"}</Button>
        )}
      </header>

      <FilterBar activeCount={activeFilters} onClear={clearFilters}>
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(0);
          }}
          placeholder="Search requests…"
          label="Search requests"
        />
        {!isClient && user && (
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v);
              setPage(0);
            }}
            options={REQUEST_STATUSES}
          />
        )}
      </FilterBar>

      <ErrorBanner
        message={error ? "Unable to load requests. Check your connection and try again." : null}
        onRetry={() => mutate()}
      />

      {!requests && !error ? (
        <Skeleton className="h-40 w-full" />
      ) : rows.length === 0 ? (
        <div className="border-t border-black/[0.06] pt-6 text-sm text-[#6e6e73]">
          {activeFilters > 0 ? (
            <>
              No requests match your filters.{" "}
              <button type="button" onClick={clearFilters} className="text-[#007aff] hover:underline">
                Clear filters
              </button>
            </>
          ) : isClient ? (
            <>
              No requests yet.
              <br />
              Create your first dataset request to get started.
            </>
          ) : (
            "No requests yet."
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
            {rows.map((r) => (
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

      {requests !== undefined && (rows.length > 0 || page > 0) && (
        <Pagination
          page={page}
          count={rows.length}
          pageSize={PAGE_SIZE}
          hasMore={hasMore}
          loading={isLoading}
          onPageChange={setPage}
        />
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
