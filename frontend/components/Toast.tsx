"use client";

import { useEffect } from "react";

export default function Toast({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [message, onDismiss]);

  if (!message) return null;
  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-black/[0.06] bg-white px-4 py-2 text-sm shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
      {message}
    </div>
  );
}
