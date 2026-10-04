export default function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-black/[0.05] ${className ?? "h-4 w-full"}`}
    />
  );
}
