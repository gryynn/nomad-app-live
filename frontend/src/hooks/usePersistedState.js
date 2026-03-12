import { useState, useCallback } from "react";

/**
 * Like useState, but persists the value in localStorage.
 * Falls back to `defaultValue` if nothing is stored or JSON parsing fails.
 */
export function usePersistedState(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored === null) return defaultValue;
      return JSON.parse(stored);
    } catch {
      return defaultValue;
    }
  });

  const setPersisted = useCallback(
    (next) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch { /* quota exceeded — ignore */ }
        return resolved;
      });
    },
    [key]
  );

  return [value, setPersisted];
}
