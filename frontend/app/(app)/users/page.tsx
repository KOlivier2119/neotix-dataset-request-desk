"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { api, ApiError, fetcher } from "@/lib/api";
import type { User } from "@/lib/types";
import { ROLE_OPTIONS } from "@/lib/constants";
import { useDebounced } from "@/lib/useDebounced";
import Button from "@/components/Button";
import ErrorBanner from "@/components/ErrorBanner";
import Skeleton from "@/components/Skeleton";
import Pagination from "@/components/Pagination";
import Toast from "@/components/Toast";
import { FilterBar, FilterSelect, SearchInput } from "@/components/Filters";

const PAGE_SIZE = 10;

export default function UsersPage() {
  return (
    <Suspense fallback={<div className="mx-auto w-full max-w-5xl p-8"><Skeleton className="h-40 w-full" /></div>}>
      <UsersBody />
    </Suspense>
  );
}

function UsersBody() {
  const { data: me } = useSWR<User>("/auth/me", fetcher);
  const router = useRouter();
  const params = useSearchParams();

  // Filters live in the URL so a refresh or a shared link keeps the same view.
  const [page, setPage] = useState(Math.max(0, Number(params.get("page") ?? "1") - 1));
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [roleFilter, setRoleFilter] = useState(params.get("role") ?? "");

  // Server-side search (name, email, organisation) + role filter.
  const term = useDebounced(search);
  const activeFilters = [term, roleFilter].filter(Boolean).length;

  useEffect(() => {
    const next = new URLSearchParams();
    if (term) next.set("q", term);
    if (roleFilter) next.set("role", roleFilter);
    if (page > 0) next.set("page", String(page + 1));
    if (next.toString() !== params.toString()) {
      router.replace(next.toString() ? `?${next.toString()}` : "/users", { scroll: false });
    }
  }, [term, roleFilter, page, params, router]);

  const query = new URLSearchParams();
  if (term) query.set("q", term);
  if (roleFilter) query.set("role", roleFilter);
  query.set("limit", String(PAGE_SIZE + 1));
  query.set("offset", String(page * PAGE_SIZE));

  const { data: users, error, mutate, isLoading } = useSWR<User[]>(
    me?.role === "admin" ? `/users?${query.toString()}` : null,
    fetcher,
  );
  // The API returns one extra row so we know whether another page exists.
  const rows = (users ?? []).slice(0, PAGE_SIZE);
  const hasMore = (users ?? []).length > PAGE_SIZE;

  function clearFilters() {
    setSearch("");
    setRoleFilter("");
    setPage(0);
  }

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
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-[#6e6e73]">Search by name, email or organisation — 10 per page.</p>
      </header>

      <FilterBar activeCount={activeFilters} onClear={clearFilters}>
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(0);
          }}
          placeholder="Search users…"
          label="Search users"
        />
        <FilterSelect
          label="Role"
          value={roleFilter}
          onChange={(v) => {
            setRoleFilter(v);
            setPage(0);
          }}
          options={ROLE_OPTIONS}
        />
      </FilterBar>

      <ErrorBanner message={error ? "Unable to load users." : null} onRetry={() => mutate()} />

      {!users && !error ? (
        <Skeleton className="h-40 w-full" />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/[0.08] px-4 py-10 text-center text-sm text-[#6e6e73]">
          {activeFilters > 0 ? (
            <>
              No users match your filters.{" "}
              <button type="button" onClick={clearFilters} className="text-[#007aff] hover:underline">
                Clear filters
              </button>
            </>
          ) : (
            "No users yet."
          )}
        </div>
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
