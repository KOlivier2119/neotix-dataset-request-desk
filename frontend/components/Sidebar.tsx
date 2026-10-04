"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Analytics01Icon,
  DashboardSquare01Icon,
  FileVideoIcon,
  InboxIcon,
  Logout01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { fetcher } from "@/lib/api";
import type { User } from "@/lib/types";

const NAV: { group: string; items: { href: string; label: string; icon: IconSvgElement; roles?: string[] }[] }[] = [
  {
    group: "Workspace",
    items: [
      { href: "/", label: "Overview", icon: DashboardSquare01Icon },
      { href: "/requests", label: "Requests", icon: InboxIcon },
      { href: "/episodes", label: "Episodes", icon: FileVideoIcon, roles: ["operator", "admin"] },
    ],
  },
  {
    group: "Insights",
    items: [
      { href: "/analytics", label: "Analytics", icon: Analytics01Icon, roles: ["operator", "admin"] },
    ],
  },
  {
    group: "Administration",
    items: [
      { href: "/users", label: "Users", icon: UserGroupIcon, roles: ["admin"] },
    ],
  },
];

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: user } = useSWR<User>("/auth/me", fetcher);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    window.location.href = "/login";
  }

  const role = user?.role;
  const initials = (user?.name ?? "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside className="flex h-full w-64 flex-col border-r border-black/[0.06] bg-[#f7f7f8] p-4">
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#1d1d1f] text-white">
          <HugeiconsIcon icon={FileVideoIcon} size={14} />
        </div>
        <span className="text-xs font-semibold tracking-[0.18em] text-[#1d1d1f]">
          DATASET REQUEST DESK
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-5">
        {NAV.map((group) => {
          const items = group.items.filter((i) => !i.roles || (role && i.roles.includes(role)));
          if (items.length === 0) return null;
          return (
            <div key={group.group}>
              <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#6e6e73]">
                {group.group}
              </p>
              <ul className="flex flex-col gap-0.5">
                {items.map((item) => {
                  const active =
                    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors duration-150 ${
                          active
                            ? "bg-black/[0.06] font-medium text-[#1d1d1f]"
                            : "text-[#6e6e73] hover:bg-black/[0.04] hover:text-[#1d1d1f]"
                        }`}
                      >
                        <HugeiconsIcon icon={item.icon} size={17} />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="mt-6 border-t border-black/[0.06] pt-4">
        <div className="flex items-center gap-3 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1d1d1f]/90 text-xs font-medium text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[#1d1d1f]">{user?.name ?? "…"}</p>
            <p className="text-xs text-[#6e6e73]">{user?.role ?? ""}</p>
          </div>
          <button onClick={logout} title="Sign out" className="text-[#6e6e73] hover:text-[#1d1d1f]">
            <HugeiconsIcon icon={Logout01Icon} size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
