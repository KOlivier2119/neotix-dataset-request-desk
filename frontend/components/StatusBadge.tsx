const COLORS: Record<string, string> = {
  submitted: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  delivered: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  accepted: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COLORS[status] ?? COLORS.submitted}`}>
      {status}
    </span>
  );
}
