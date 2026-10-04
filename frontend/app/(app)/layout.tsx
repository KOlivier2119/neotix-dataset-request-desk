"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Menu01Icon } from "@hugeicons/core-free-icons";
import Sidebar from "@/components/Sidebar";
import CommandPalette from "@/components/CommandPalette";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <div className="hidden md:block sticky top-0 h-screen">
        <Sidebar />
      </div>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="h-full">
            <Sidebar onNavigate={() => setDrawer(false)} />
          </div>
          <div className="flex-1 bg-black/20" onClick={() => setDrawer(false)} />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center border-b border-black/[0.06] p-3 md:hidden">
          <button onClick={() => setDrawer(true)} className="p-1 text-[#1d1d1f]">
            <HugeiconsIcon icon={Menu01Icon} size={20} />
          </button>
          <span className="ml-2 text-xs font-semibold tracking-[0.18em]">DATASET REQUEST DESK</span>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <CommandPalette />
    </div>
  );
}
