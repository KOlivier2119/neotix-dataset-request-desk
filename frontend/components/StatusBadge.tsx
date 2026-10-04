const COLORS: Record<string, string> = {
  submitted: "bg-black/[0.05] text-[#6e6e73]",
  in_progress: "bg-[#007aff]/10 text-[#0056b3]",
  delivered: "bg-[#bf5af2]/10 text-[#8e44ad]",
  accepted: "bg-[#34c759]/10 text-[#248a3d]",
  rejected: "bg-[#ff3b30]/10 text-[#c1272d]",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${COLORS[status] ?? COLORS.submitted}`}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-60" />
      {status.replace("_", " ")}
    </span>
  );
}
