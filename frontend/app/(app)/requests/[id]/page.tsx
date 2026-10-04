"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { api, ApiError, fetcher } from "@/lib/api";
import type { Episode, RequestDetail, User } from "@/lib/types";
import { QUALITY_OPTIONS, ROBOT_OPTIONS } from "@/lib/constants";
import { useDebounced } from "@/lib/useDebounced";
import Button from "@/components/Button";
import ErrorBanner from "@/components/ErrorBanner";
import StatusBadge from "@/components/StatusBadge";
import Skeleton from "@/components/Skeleton";
import Pagination from "@/components/Pagination";
import Toast from "@/components/Toast";
import { FilterBar, FilterSelect, SearchInput, TextInput } from "@/components/Filters";

const FLOW = ["submitted", "in_progress", "delivered", "accepted"];
const NEXT: Record<string, string> = { submitted: "in_progress", in_progress: "delivered", rejected: "in_progress" };
const PAGE_SIZE = 10;

function Workflow({ status }: { status: string }) {
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex items-center gap-0">
        {FLOW.map((step, i) => {
          const done = FLOW.indexOf(status) >= i && status !== "rejected";
          const current = status === step;
          return (
            <li key={step} className="flex flex-1 items-center last:flex-none">
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
                  current
                    ? "border-black/20 bg-black/[0.04] font-medium"
                    : done
                      ? "border-black/[0.06] text-[#6e6e73]"
                      : "border-black/[0.06] text-[#6e6e73]/60"
                }`}
              >
                {step.replace("_", " ")}
              </span>
              {i < FLOW.length - 1 && <span className="mx-2 h-px flex-1 bg-black/[0.08]" />}
            </li>
          );
        })}
      </ol>
      {status === "rejected" && (
        <p className="text-xs text-[#c1272d]">Rejected → returns to In progress for rework.</p>
      )}
    </div>
  );
}

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: user } = useSWR<User>("/auth/me", fetcher);
  const { data: req, error, mutate } = useSWR<RequestDetail>(`/requests/${id}`, fetcher);

  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [filterTask, setFilterTask] = useState<string | null>(null);
  const [filterQuality, setFilterQuality] = useState("");
  const [filterRobot, setFilterRobot] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const effectiveTask = filterTask ?? req?.task_name ?? "";
  const isOperator = user?.role === "operator" || user?.role === "admin";
  const [pickerPage, setPickerPage] = useState(0);

  // Search + filters run server-side, so they apply across every page rather
  // than only the rows currently on screen.
  const term = useDebounced(search);
  const activePickerFilters = [term, effectiveTask, filterQuality, filterRobot].filter(Boolean).length;

  const pickerQuery = new URLSearchParams();
  if (term) pickerQuery.set("q", term);
  if (effectiveTask) pickerQuery.set("task_name", effectiveTask);
  if (filterQuality) pickerQuery.set("quality", filterQuality);
  if (filterRobot) pickerQuery.set("robot_id", filterRobot);
  pickerQuery.set("limit", String(PAGE_SIZE + 1));
  pickerQuery.set("offset", String(pickerPage * PAGE_SIZE));

  const pickerKey = isOperator ? `/episodes?${pickerQuery.toString()}` : null;
  const { data: episodes, isLoading: episodesLoading, mutate: mutateEpisodes } = useSWR<Episode[]>(pickerKey, fetcher);
  // The API returns one extra row so we know whether another page exists.
  const hasMoreEpisodes = (episodes ?? []).length > PAGE_SIZE;
  const visibleEpisodes = (episodes ?? []).slice(0, PAGE_SIZE);

  function clearPickerFilters() {
    setSearch("");
    setFilterTask("");
    setFilterQuality("");
    setFilterRobot("");
    setPickerPage(0);
  }

  async function transition(to: string) {
    setActionError(null);
    try {
      await api(`/requests/${id}/transition`, { method: "POST", body: JSON.stringify({ to_status: to }) });
      setToast(`Moved to ${to}`);
      mutate();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Transition failed");
    }
  }

  async function assignSelected() {
    setActionError(null);
    try {
      await api(`/requests/${id}/assignments`, { method: "POST", body: JSON.stringify({ episode_ids: [...selected] }) });
      setToast(`${selected.size} episode${selected.size === 1 ? "" : "s"} assigned`);
      setSelected(new Set());
      mutate();
      mutateEpisodes();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Assign failed");
    }
  }

  async function unassign(episodeId: number) {
    setActionError(null);
    try {
      await api(`/requests/${id}/assignments/${episodeId}`, { method: "DELETE" });
      setToast("Episode unassigned");
      mutate();
      mutateEpisodes();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Unassign failed");
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <ErrorBanner message={error instanceof ApiError ? error.message : String(error)} onRetry={() => mutate()} />
        <Link href="/requests" className="mt-4 inline-block text-sm text-[#007aff] underline">Back to requests</Link>
      </div>
    );
  }
  if (!req || !user) {
    return <div className="mx-auto max-w-4xl p-8"><Skeleton className="h-64 w-full" /></div>;
  }

  const next = NEXT[req.status];
  const remaining = Math.max(0, req.episodes_requested - req.assigned_count);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 p-8 pb-32">
      <Link href="/requests" className="text-sm text-[#007aff] hover:underline">← Back</Link>

      <header>
        <p className="text-xs uppercase tracking-[0.16em] text-[#6e6e73]">Request #{req.id}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{req.title}</h1>
        <div className="mt-2 flex items-center gap-3 text-sm text-[#6e6e73]">
          <StatusBadge status={req.status} />
          <span>Client: {req.client_name || `#${req.client_id}`}</span>
        </div>
      </header>

      <ErrorBanner message={actionError} />

      <section>
        <p className="text-4xl font-semibold tracking-tight">
          {req.assigned_count} <span className="text-xl text-[#6e6e73]">/ {req.episodes_requested}</span>
        </p>
        <p className="text-sm text-[#6e6e73]">{remaining} episodes remaining</p>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-black/[0.06]">
          <div
            className="h-full rounded-full bg-[#1d1d1f] transition-all duration-300"
            style={{ width: `${Math.min(100, (req.assigned_count / Math.max(1, req.episodes_requested)) * 100)}%` }}
          />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
        <div><p className="text-[#6e6e73]">Deadline</p><p>{new Date(req.deadline).toLocaleDateString()}</p></div>
        <div><p className="text-[#6e6e73]">Episodes requested</p><p>{req.episodes_requested}</p></div>
        <div><p className="text-[#6e6e73]">Episodes assigned</p><p>{req.assigned_count}</p></div>
        <div><p className="text-[#6e6e73]">Client</p><p>{req.client_name || `#${req.client_id}`}</p></div>
        <div><p className="text-[#6e6e73]">Created</p><p>{new Date(req.created_at).toLocaleDateString()}</p></div>
        <div><p className="text-[#6e6e73]">Task</p><p>{req.task_name}</p></div>
      </section>

      {req.notes && <p className="max-w-2xl text-sm text-[#6e6e73]">{req.notes}</p>}

      <section>
        <h2 className="mb-3 text-lg font-medium">Workflow</h2>
        <Workflow status={req.status} />
      </section>

      <section className="flex gap-2">
        {user.role === "client" && req.status === "delivered" && (
          <>
            <Button onClick={() => transition("accepted")}>Accept</Button>
            <Button variant="secondary" onClick={() => transition("rejected")}>Reject</Button>
          </>
        )}
        {isOperator && next && <Button onClick={() => transition(next)}>Move to {next.replace("_", " ")}</Button>}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Status history</h2>
        <table className="w-full border-collapse text-sm">
          <tbody className="divide-y divide-black/[0.04]">
            {req.history.map((h) => (
              <tr key={h.id}>
                <td className="py-2 pr-4 text-[#6e6e73]">{h.from_status ?? "—"} → {h.to_status}</td>
                <td className="py-2 pr-4 text-[#6e6e73]">by {h.actor_id}</td>
                <td className="py-2 text-right text-[#6e6e73]">{new Date(h.changed_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {isOperator && (
        <section>
          <h2 className="mb-2 text-lg font-medium">Assigned episodes</h2>
          {req.assigned_episode_ids.length === 0 ? (
            <p className="text-sm text-[#6e6e73]">None yet.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {req.assigned_episode_ids.map((eid) => (
                <li key={eid} className="flex items-center justify-between border-b border-black/[0.04] py-1.5">
                  <span>Episode #{eid}</span>
                  {req.status === "in_progress" && (
                    <button onClick={() => unassign(eid)} className="text-[#007aff] hover:underline">Unassign</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {isOperator && req.status === "in_progress" && (
        <section className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-medium">Assign episodes</h2>
            <p className="text-sm text-[#6e6e73]">{remaining} required · {req.assigned_count} assigned</p>
          </div>

          <FilterBar activeCount={activePickerFilters} onClear={clearPickerFilters}>
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPickerPage(0);
              }}
              placeholder="Search episodes…"
              label="Search episodes"
            />
            <TextInput
              value={effectiveTask}
              onChange={(v) => {
                setFilterTask(v);
                setPickerPage(0);
              }}
              placeholder="task_name"
              label="Filter by task name"
            />
            <FilterSelect
              label="Quality"
              value={filterQuality}
              onChange={(v) => {
                setFilterQuality(v);
                setPickerPage(0);
              }}
              options={QUALITY_OPTIONS}
            />
            <FilterSelect
              label="Robot"
              value={filterRobot}
              onChange={(v) => {
                setFilterRobot(v);
                setPickerPage(0);
              }}
              options={ROBOT_OPTIONS}
            />
          </FilterBar>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {["", "Episode", "Robot", "Task", "Recorded", "Duration", "Operator", "Quality"].map((h) => (
                    <th key={h} className="border-b border-black/[0.06] pb-2 pr-4 text-left text-xs font-medium uppercase tracking-wide text-[#6e6e73]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleEpisodes.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-sm text-[#6e6e73]">
                      {episodesLoading ? (
                        "Loading episodes…"
                      ) : activePickerFilters > 0 ? (
                        <>
                          No episodes match your filters.{" "}
                          <button type="button" onClick={clearPickerFilters} className="text-[#007aff] hover:underline">
                            Clear filters
                          </button>
                        </>
                      ) : (
                        "No episodes available."
                      )}
                    </td>
                  </tr>
                ) : (
                  visibleEpisodes.map((e) => {
                    const disabled = e.quality === "bad" || req.assigned_episode_ids.includes(e.id);
                    return (
                      <tr key={e.id} className={`border-b border-black/[0.04] last:border-0 ${disabled ? "opacity-40" : ""}`}>
                        <td className="py-2 pr-4">
                          <input
                            type="checkbox"
                            disabled={disabled}
                            checked={selected.has(e.id)}
                            onChange={() =>
                              setSelected((prev) => {
                                const next = new Set(prev);
                                next.has(e.id) ? next.delete(e.id) : next.add(e.id);
                                return next;
                              })
                            }
                          />
                        </td>
                        <td className="py-2 pr-4 font-medium">{e.episode_id}</td>
                        <td className="py-2 pr-4 text-[#6e6e73]">{e.robot_id}</td>
                        <td className="py-2 pr-4 text-[#6e6e73]">{e.task_name}</td>
                        <td className="py-2 pr-4 text-[#6e6e73]">{new Date(e.recorded_at).toLocaleDateString()}</td>
                        <td className="py-2 pr-4 text-[#6e6e73]">{e.duration_seconds}s</td>
                        <td className="py-2 pr-4 text-[#6e6e73]">{e.operator_name}</td>
                        <td className="py-2 pr-4"><StatusBadge status={e.quality === "bad" ? "rejected" : e.quality === "usable" ? "delivered" : "accepted"} /></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {(visibleEpisodes.length > 0 || pickerPage > 0) && (
            <Pagination
              page={pickerPage}
              count={visibleEpisodes.length}
              pageSize={PAGE_SIZE}
              hasMore={hasMoreEpisodes}
              loading={episodesLoading}
              onPageChange={setPickerPage}
            />
          )}
        </section>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 rounded-full border border-black/[0.06] bg-white px-5 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
          <span className="text-sm">{selected.size} episode{selected.size === 1 ? "" : "s"} selected</span>
          <Button variant="secondary" onClick={() => setSelected(new Set())}>Cancel</Button>
          <Button onClick={assignSelected}>Assign</Button>
        </div>
      )}

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
