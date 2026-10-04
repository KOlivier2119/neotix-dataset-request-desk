"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, ApiError, fetcher } from "@/lib/api";
import type { User } from "@/lib/types";
import Button from "@/components/Button";
import ErrorBanner from "@/components/ErrorBanner";
import Skeleton from "@/components/Skeleton";
import Pagination from "@/components/Pagination";
import Toast from "@/components/Toast";

const PAGE_SIZE = 25;

export default function UsersPage() {
  const { data: me } = useSWR<User>("/auth/me", fetcher);
  const [page, setPage] = useState(0);
  const { data: users, error, mutate, isLoading } = useSWR<User[]>(
    me?.role === "admin" ? `/users?limit=${PAGE_SIZE + 1}&offset=${page * PAGE_SIZE}` : null,
    fetcher,
  );
  // The API returns one extra row so we know whether another page exists.
  const rows = (users ?? []).slice(0, PAGE_SIZE);
  const hasMore = (users ?? []).length > PAGE_SIZE;

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("operator");
  const [organisation, setOrganisation] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      await api("/users", {
        method: "POST",
        body: JSON.stringify({ email, name, password, role, organisation: organisation || null }),
      });
      setEmail("");
      setName("");
      setPassword("");
      setOrganisation("");
      setToast("User created");
      mutate();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not create user");
    }
  }

  async function toggleActive(u: User) {
    try {
      await api(`/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !u.is_active }) });
      mutate();
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Update failed");
    }
  }

  if (me && me.role !== "admin") {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <ErrorBanner message="User administration is available to admins only." />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">Users</h1>

      <ErrorBanner message={error ? "Unable to load users." : null} onRetry={() => mutate()} />

      {!users && !error ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {["Name", "Email", "Role", "Organisation", "Status", ""].map((h) => (
                  <th key={h} className="border-b border-black/[0.06] pb-2 pr-4 text-left text-xs font-medium uppercase tracking-wide text-[#6e6e73]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-b border-black/[0.04] last:border-0">
                  <td className="py-2.5 pr-4 font-medium">{u.name}</td>
                  <td className="py-2.5 pr-4 text-[#6e6e73]">{u.email}</td>
                  <td className="py-2.5 pr-4 text-[#6e6e73]">{u.role}</td>
                  <td className="py-2.5 pr-4 text-[#6e6e73]">{u.organisation ?? "—"}</td>
                  <td className="py-2.5 pr-4">{u.is_active ? "Active" : "Deactivated"}</td>
                  <td className="py-2.5 pr-4 text-right">
                    <button onClick={() => toggleActive(u)} className="text-[#007aff] hover:underline">
                      {u.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

      <section>
        <h2 className="mb-3 text-lg font-medium">New user</h2>
        <ErrorBanner message={formError} />
        <form onSubmit={createUser} className="flex max-w-lg flex-col gap-3">
          <input
            className="rounded-md border border-black/[0.08] bg-white px-3 py-2 text-sm"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="rounded-md border border-black/[0.08] bg-white px-3 py-2 text-sm"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="rounded-md border border-black/[0.08] bg-white px-3 py-2 text-sm"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <select
            className="rounded-md border border-black/[0.08] bg-white px-3 py-2 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="operator">operator</option>
            <option value="admin">admin</option>
            <option value="client">client</option>
          </select>
          <input
            className="rounded-md border border-black/[0.08] bg-white px-3 py-2 text-sm"
            placeholder="Organisation (optional)"
            value={organisation}
            onChange={(e) => setOrganisation(e.target.value)}
          />
          <Button type="submit">Create user</Button>
        </form>
      </section>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
