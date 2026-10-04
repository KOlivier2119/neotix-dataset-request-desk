"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { api, ApiError, fetcher } from "@/lib/api";
import type { Episode, RequestDetail, User } from "@/lib/types";
import Button from "@/components/Button";
import ErrorBanner from "@/components/ErrorBanner";
import StatusBadge from "@/components/StatusBadge";
import Table from "@/components/Table";

const NEXT_TRANSITIONS: Record<string, string> = {
  submitted: "in_progress",
  in_progress: "delivered",
  rejected: "in_progress",
};

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: user } = useSWR<User>("/auth/me", fetcher);
  const { data: req, error, mutate } = useSWR<RequestDetail>(`/requests/${id}`, fetcher);

  const [actionError, setActionError] = useState<string | null>(null);

  const [filterTask, setFilterTask] = useState<string | null>(null);
  const [filterQuality, setFilterQuality] = useState("");

  const effectiveTask = filterTask ?? req?.task_name ?? "";
  const pickerKey =
    user && user.role !== "client"
      ? `/episodes?${effectiveTask ? `task_name=${encodeURIComponent(effectiveTask)}&` : ""}${filterQuality ? `quality=${filterQuality}&` : ""}limit=50`
      : null;
  const { data: episodes, mutate: mutateEpisodes } = useSWR<Episode[]>(pickerKey, fetcher);

  async function transition(to: string) {
    setActionError(null);
    try {
      await api(`/requests/${id}/transition`, { method: "POST", body: JSON.stringify({ to_status: to }) });
      mutate();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Transition failed");
    }
  }

  async function assign(episodeId: number) {
    setActionError(null);
    try {
      await api(`/requests/${id}/assignments`, { method: "POST", body: JSON.stringify({ episode_ids: [episodeId] }) });
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
      mutate();
      mutateEpisodes();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Unassign failed");
    }
  }

  if (error) {
    return (
      <main className="mx-auto w-full max-w-4xl p-8">
        <ErrorBanner message={error instanceof ApiError ? error.message : String(error)} />
        <Link href="/requests" className="underline">Back to requests</Link>
      </main>
    );
  }
  if (!req || !user) {
    return <main className="mx-auto w-full max-w-4xl p-8">Loading…</main>;
  }

  const isOperator = user.role === "operator" || user.role === "admin";
  const next = NEXT_TRANSITIONS[req.status];

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Request {req.id}: {req.title}</h1>
        <Link href="/requests" className="underline">Back</Link>
      </div>

      <ErrorBanner message={actionError} />

      <section className="flex flex-col gap-1 text-sm">
        <div>Status: <StatusBadge status={req.status} /></div>
        <div>Task: {req.task_name}</div>
        <div>Episodes requested: {req.episodes_requested}</div>
        <div>Assigned: {req.assigned_episode_ids.length} / {req.episodes_requested}</div>
        <div>Deadline: {new Date(req.deadline).toLocaleString()}</div>
        {req.notes && <div>Notes: {req.notes}</div>}
      </section>

      <section className="flex gap-2">
        {user.role === "client" && req.status === "delivered" && (
          <>
            <Button onClick={() => transition("accepted")}>Accept</Button>
            <Button onClick={() => transition("rejected")}>Reject</Button>
          </>
        )}
        {isOperator && next && (
          <Button onClick={() => transition(next)}>Move to {next}</Button>
        )}
      </section>

      <section>
        <h2 className="text-xl font-semibold">Status history</h2>
        <Table headers={["From", "To", "Actor", "When"]}>
          {req.history.map((h) => (
            <tr key={h.id}>
              <td className="border-b px-2 py-1">{h.from_status ?? "—"}</td>
              <td className="border-b px-2 py-1">{h.to_status}</td>
              <td className="border-b px-2 py-1">{h.actor_id}</td>
              <td className="border-b px-2 py-1">{new Date(h.changed_at).toLocaleString()}</td>
            </tr>
          ))}
        </Table>
      </section>

      {isOperator && (
        <section>
          <h2 className="text-xl font-semibold">Assigned episodes</h2>
          {req.assigned_episode_ids.length === 0 ? (
            <p className="text-sm text-zinc-500">None yet.</p>
          ) : (
            <ul className="text-sm">
              {req.assigned_episode_ids.map((eid) => (
                <li key={eid} className="flex items-center gap-2">
                  Episode #{eid}
                  {req.status === "in_progress" && (
                    <Button onClick={() => unassign(eid)}>Unassign</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {isOperator && req.status === "in_progress" && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Episode picker</h2>
          <div className="flex gap-3 text-sm">
            <input
              className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
              placeholder="task_name"
              value={effectiveTask}
              onChange={(e) => setFilterTask(e.target.value)}
            />
            <select
              className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
              value={filterQuality}
              onChange={(e) => setFilterQuality(e.target.value)}
            >
              <option value="">any quality</option>
              <option value="good">good</option>
              <option value="usable">usable</option>
              <option value="bad">bad</option>
            </select>
          </div>
          <Table headers={["ID", "Episode", "Robot", "Task", "Quality", "Duration", ""]}>
            {(episodes ?? []).map((e) => (
              <tr key={e.id}>
                <td className="border-b px-2 py-1">{e.id}</td>
                <td className="border-b px-2 py-1">{e.episode_id}</td>
                <td className="border-b px-2 py-1">{e.robot_id}</td>
                <td className="border-b px-2 py-1">{e.task_name}</td>
                <td className="border-b px-2 py-1">{e.quality}</td>
                <td className="border-b px-2 py-1">{e.duration_seconds}s</td>
                <td className="border-b px-2 py-1">
                  <Button onClick={() => assign(e.id)}>Assign</Button>
                </td>
              </tr>
            ))}
          </Table>
        </section>
      )}
    </main>
  );
}
