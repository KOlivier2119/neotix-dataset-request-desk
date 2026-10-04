"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { ApiError, fetcher } from "@/lib/api";
import type { Episode, ImportReport, User } from "@/lib/types";
import { QUALITY_OPTIONS, ROBOT_OPTIONS } from "@/lib/constants";
import { useDebounced } from "@/lib/useDebounced";
import Button from "@/components/Button";
import ErrorBanner from "@/components/ErrorBanner";
import StatusBadge from "@/components/StatusBadge";
import Skeleton from "@/components/Skeleton";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import Toast from "@/components/Toast";
import { FilterBar, FilterSelect, SearchInput } from "@/components/Filters";

const PAGE_SIZE = 10;

export default function EpisodesPage() {
  return (
    <Suspense fallback={<div className="mx-auto w-full max-w-6xl p-8"><Skeleton className="h-56 w-full" /></div>}>
      <EpisodesBody />
    </Suspense>
  );
}

function EpisodesBody() {
  const { data: user } = useSWR<User>("/auth/me", fetcher);
  const router = useRouter();
  const params = useSearchParams();

  // Filters live in the URL so a refresh or a shared link keeps the same view.
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [quality, setQuality] = useState(params.get("quality") ?? "");
  const [robot, setRobot] = useState(params.get("robot_id") ?? "");
  const [page, setPage] = useState(Math.max(0, Number(params.get("page") ?? "1") - 1));
  const [toast, setToast] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const next = new URLSearchParams();
    if (search) next.set("q", search);
    if (quality) next.set("quality", quality);
    if (robot) next.set("robot_id", robot);
    if (page > 0) next.set("page", String(page + 1));
    if (next.toString() !== params.toString()) {
      router.replace(next.toString() ? `?${next.toString()}` : "/episodes", { scroll: false });
    }
  }, [search, quality, robot, page, params, router]);

  // The API does the searching (across every page), so the key only changes
  // once the user pauses typing.
  const term = useDebounced(search);
  const activeFilters = [term, quality, robot].filter(Boolean).length;

  const query = new URLSearchParams();
  if (term) query.set("q", term);
  if (quality) query.set("quality", quality);
  if (robot) query.set("robot_id", robot);
  query.set("limit", String(PAGE_SIZE + 1));
  query.set("offset", String(page * PAGE_SIZE));

  const key = user ? `/episodes?${query.toString()}` : null;
  const { data: episodes, error, mutate, isLoading } = useSWR<Episode[]>(key, fetcher);
  // The API returns one extra row so we know whether another page exists.
  const rows = (episodes ?? []).slice(0, PAGE_SIZE);
  const hasMore = (episodes ?? []).length > PAGE_SIZE;

  function clearFilters() {
    setSearch("");
    setQuality("");
    setRobot("");
    setPage(0);
  }

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
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Episodes</h1>
          <p className="mt-1 text-sm text-[#6e6e73]">
            Search by episode id, robot, task or operator — 10 per page.
          </p>
        </div>
        <div>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onImport} />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>Import episodes</Button>
        </div>
      </header>

      <FilterBar activeCount={activeFilters} onClear={clearFilters}>
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(0);
          }}
          placeholder="Search episodes…"
          label="Search episodes"
        />
        <FilterSelect
          label="Quality"
          value={quality}
          onChange={(v) => {
            setQuality(v);
            setPage(0);
          }}
          options={QUALITY_OPTIONS}
        />
        <FilterSelect
          label="Robot"
          value={robot}
          onChange={(v) => {
            setRobot(v);
            setPage(0);
          }}
          options={ROBOT_OPTIONS}
        />
      </FilterBar>

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
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/[0.08] px-4 py-10 text-center text-sm text-[#6e6e73]">
          {activeFilters > 0 ? (
            <>
              No episodes match your filters.{" "}
              <button type="button" onClick={clearFilters} className="text-[#007aff] hover:underline">
                Clear filters
              </button>
            </>
          ) : (
            "No episodes yet. Import a CSV to get started."
          )}
        </div>
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
