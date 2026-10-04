"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { HugeiconsIcon } from "@hugeicons/react";
import { CommandIcon } from "@hugeicons/core-free-icons";
import { fetcher } from "@/lib/api";
import type { User } from "@/lib/types";

interface Command {
  label: string;
  href: string;
  roles?: string[];
}

const COMMANDS: Command[] = [
  { label: "Go to dashboard", href: "/" },
  { label: "Go to requests", href: "/requests" },
  { label: "Go to episodes", href: "/episodes", roles: ["operator", "admin"] },
  { label: "Go to analytics", href: "/analytics", roles: ["operator", "admin"] },
  { label: "Go to users", href: "/users", roles: ["admin"] },
  { label: "Create request", href: "/requests?new=1", roles: ["client"] },
  { label: "Import episodes", href: "/episodes", roles: ["operator", "admin"] },
];

export default function CommandPalette() {
  const router = useRouter();
  const { data: user } = useSWR<User>("/auth/me", fetcher);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        setQuery("");
        setActive(0);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const filtered = useMemo(() => {
    const available = COMMANDS.filter((c) => !c.roles || (user && c.roles.includes(user.role)));
    const q = query.trim().toLowerCase();
    if (!q) return available;
    return available.filter((c) => c.label.toLowerCase().includes(q));
  }, [query, user]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-32" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-black/[0.06] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-black/[0.06] px-4">
          <HugeiconsIcon icon={CommandIcon} size={16} />
          <input
            ref={inputRef}
            className="w-full py-3 text-sm outline-none"
            placeholder="Type a command…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === "Enter") {
                const cmd = filtered[active];
                if (cmd) { setOpen(false); router.push(cmd.href); }
              }
            }}
          />
        </div>
        <ul className="max-h-72 overflow-y-auto py-1">
          {filtered.map((c, i) => (
            <li key={c.label}>
              <button
                className={`w-full px-4 py-2 text-left text-sm transition-colors duration-100 ${i === active ? "bg-black/[0.05]" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => { setOpen(false); router.push(c.href); }}
              >
                {c.label}
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-4 py-3 text-sm text-[#6e6e73]">No commands found.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
