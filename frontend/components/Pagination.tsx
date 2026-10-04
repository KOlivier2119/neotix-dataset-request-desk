"use client";

type Props = {
  /** Zero-based index of the current page. */
  page: number;
  /** Rows shown on the current page. */
  count: number;
  /** Page size used to fetch (the caller asks for pageSize + 1 rows to detect a next page). */
  pageSize: number;
  /** True when the API returned more rows than fit on this page. */
  hasMore: boolean;
  onPageChange: (page: number) => void;
  /** Keeps the controls inert while a new page is loading. */
  loading?: boolean;
};

export default function Pagination({ page, count, pageSize, hasMore, onPageChange, loading }: Props) {
  const from = count === 0 ? 0 : page * pageSize + 1;
  const to = page * pageSize + count;

  const button =
    "rounded-md border border-black/[0.08] px-3 py-1.5 text-sm transition-colors hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.06] pt-3 text-sm text-[#6e6e73]">
      <span>
        {count === 0 ? "No rows" : `Showing ${from}–${to}`}
        {hasMore ? " · more available" : ""}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={button}
          disabled={loading || page === 0}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        <span className="text-xs">Page {page + 1}</span>
        <button
          type="button"
          className={button}
          disabled={loading || !hasMore}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
