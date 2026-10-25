"use client";

/**
 * Hydration-safe reads of browser-only state without setState-in-effect.
 * The server snapshot is used for SSR and hydration; the client value takes
 * over right after, exactly like the old `useEffect(() => setX(...), [])`.
 */

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** False during SSR / hydration, true once running in the browser. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * Read a browser-only primitive value once mounted. `read` must return a
 * primitive (or the same reference) on repeated calls.
 */
export function useClientValue<T>(read: () => T, serverValue: T): T {
  return useSyncExternalStore(noopSubscribe, read, () => serverValue);
}

/** Live `matchMedia` result; `serverValue` during SSR. */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}
