"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import { api, ApiError, fetcher } from "@/lib/api";
import type { Episode, ImportReport, User } from "@/lib/types";
import Button from "@/components/Button";
import ErrorBanner from "@/components/ErrorBanner";
import StatusBadge from "@/components/StatusBadge";
import Skeleton from "@/components/Skeleton";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import Toast from "@/components/Toast";

const PAGE_SIZE = 25;

export default function EpisodesPage() {
  const { data: user } = useSWR<User>("/auth/me", fetcher);
  const [taskName, setTaskName] = useState("");
  const [quality, setQuality] = useState("");
  const [page, setPage] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const key = user
    ? `/episodes?${taskName ? `task_name=${encodeURIComponent(taskName)}&` : ""}${quality ? `quality=${quality}&` : ""}limit=${PAGE_SIZE + 1}&offset=${page * PAGE_SIZE}`
    : null;
  const { data: episodes, error, mutate, isLoading } = useSWR<Episode[]>(key, fetcher);
  // The API returns one extra row so we know whether another page exists.
  const rows = (episodes ?? []).slice(0, PAGE_SIZE);
  const hasMore = (episodes ?? []).length > PAGE_SIZE;

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/episodes/import", { method: "POST", body: form, credentials: "same-origin" });
      const body = await res.json();
      if (!res.ok) throw new ApiError(res.status, body?.detail ?? "Import failed");
      setReport(body);
      setToast(`Imported ${body.imported} episodes`);
      mutate();
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : "Import failed");
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  if (user && user.role === "client") {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <ErrorBanner message="Episodes are available to operators and admins only." />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-8">
      <header className="flex items-end justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Episodes</h1>
        <div>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onImport} />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>Import episodes</Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <input className="rounded-md border border-black/[0.08] bg-white px-3 py-1.5 text-sm outline-none" placeholder="task_name" value={taskName} onChange={(e) => { setTaskName(e.target.value); setPage(0); }} />
        <select className="rounded-md border border-black/[0.08] bg-white px-3 py-1.5 text-sm" value={quality} onChange={(e) => { setQuality(e.target.value); setPage(0); }}>
          <option value="">any quality</option>
          <option value="good">good</option>
          <option value="usable">usable</option>
          <option value="bad">bad</option>
        </select>
      </div>

      <ErrorBanner message={importError || (error ? "Unable to load episodes." : null)} onRetry={() => mutate()} />

      {report && (
        <div className="rounded-lg border border-black/[0.06] bg-white p-4 text-sm">
          <p>
            {report.imported} imported · {report.skipped_duplicate_in_file} duplicates in file · {report.skipped_existing} already existed · {report.rejected.length} rejected
          </p>
        </div>
      )}

      {!episodes && !error ? (
        <Skeleton className="h-56 w-full" />
      ) : (
        <>
          <Table headers={["Episode", "Robot", "Task", "Recorded", "Duration", "Operator", "Quality"]}>
            {rows.map((e) => (
              <tr key={e.id} className="border-b border-black/[0.04] last:border-0">
                <td className="py-2.5 pr-4 font-medium">{e.episode_id}</td>
                <td className="py-2.5 pr-4 text-[#6e6e73]">{e.robot_id}</td>
                <td className="py-2.5 pr-4 text-[#6e6e73]">{e.task_name}</td>
                <td className="py-2.5 pr-4 text-[#6e6e73]">{new Date(e.recorded_at).toLocaleDateString()}</td>
                <td className="py-2.5 pr-4 text-[#6e6e73]">{e.duration_seconds}s</td>
                <td className="py-2.5 pr-4 text-[#6e6e73]">{e.operator_name}</td>
                <td className="py-2.5 pr-4">
                  <StatusBadge status={e.quality === "bad" ? "rejected" : e.quality === "usable" ? "delivered" : "accepted"} />
                </td>
              </tr>
            ))}
          </Table>
          <Pagination
            page={page}
            count={rows.length}
            pageSize={PAGE_SIZE}
            hasMore={hasMore}
            loading={isLoading}
            onPageChange={setPage}
          />
        </>
      )}

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
