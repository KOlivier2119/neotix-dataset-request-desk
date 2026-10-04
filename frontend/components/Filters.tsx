"use client";

import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";

const FIELD =
  "rounded-md border border-black/[0.08] bg-white px-3 py-1.5 text-sm outline-none transition-colors focus:border-black/20";

/** Toolbar that lays out search + filter controls and offers a single "clear". */
export function FilterBar({
  children,
  activeCount = 0,
  onClear,
}: {
  children: ReactNode;
  activeCount?: number;
  onClear?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {children}
      {activeCount > 0 && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-[#007aff] transition-colors hover:bg-[#007aff]/5"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={14} />
          Clear {activeCount === 1 ? "filter" : `${activeCount} filters`}
        </button>
      )}
    </div>
  );
}

/** Text search box with an inline icon and an inline clear button. */
export function SearchInput({
  value,
  onChange,
  placeholder,
  width = "w-64",
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  width?: string;
  label?: string;
}) {
  return (
    <label
      className={`flex items-center gap-2 ${FIELD} ${width}`}
      aria-label={label ?? placeholder}
    >
      <HugeiconsIcon icon={Search01Icon} size={15} className="shrink-0 text-[#6e6e73]" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#6e6e73] [&::-webkit-search-cancel-button]:hidden"
      />
      {value !== "" && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="shrink-0 text-[#6e6e73] transition-colors hover:text-[#1d1d1f]"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={14} />
        </button>
      )}
    </label>
  );
}

/** Single-line text field styled like the other filter controls. */
export function TextInput({
  value,
  onChange,
  placeholder,
  width = "w-44",
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  width?: string;
  label?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={label ?? placeholder}
      className={`${FIELD} ${width} placeholder:text-[#6e6e73]`}
    />
  );
}

/** Native select styled like the other filter controls. */
export function FilterSelect({
  value,
  onChange,
  options,
  label,
  width = "min-w-32",
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  label?: string;
  width?: string;
}) {
  return (
    <label className={`flex items-center gap-2 text-sm text-[#6e6e73] ${width}`}>
      {label && <span className="shrink-0">{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full ${FIELD} text-[#1d1d1f]`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
