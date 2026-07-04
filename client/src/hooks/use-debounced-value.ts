import { useEffect, useState } from "react";

/**
 * Returns a debounced copy of `value` that only updates after `delayMs` of quiet.
 * Used by the stress page so dragging a slider doesn't recompute 5 curves on every
 * pixel — we wait ~60ms, then run the scenario engine once.
 */
export function useDebouncedValue<T>(value: T, delayMs = 60): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
