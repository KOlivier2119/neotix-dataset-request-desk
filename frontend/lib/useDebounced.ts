"use client";

import { useEffect, useState } from "react";

/**
 * Returns `value` after it has stopped changing for `delay` ms.
 *
 * Used for search boxes so the SWR key (and therefore the network request)
 * only changes once the user pauses typing, instead of on every keystroke.
 */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
