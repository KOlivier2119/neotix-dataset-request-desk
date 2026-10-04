export default function ErrorBanner({
  message,
  onRetry,
}: {
  message?: string | null;
  onRetry?: () => void;
}) {
  if (!message) return null;
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-[#ff3b30]/20 bg-[#ff3b30]/[0.04] px-4 py-3 text-sm text-[#c1272d]">
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="font-medium text-[#007aff] hover:underline">
          Retry
        </button>
      )}
    </div>
  );
}
