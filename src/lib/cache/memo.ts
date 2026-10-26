/**
 * Per-instance TTL memo for expensive server reads (upstream feeds, DB
 * aggregates) that many requests need with the same inputs. Concurrent
 * callers share one in-flight promise; failures are not cached.
 *
 * Server-only. Not a substitute for the cross-instance PlayerPoolSnapshot —
 * it just stops a warm instance from refetching the same thing per request.
 */

type Entry<T> = { expiresAt: number; value: Promise<T> };

const store = new Map<string, Entry<unknown>>();
const MAX_ENTRIES = 200;

export function memoTtl<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  now: () => number = Date.now,
): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now()) return hit.value;

  const value = load();
  store.set(key, { expiresAt: now() + ttlMs, value });
  // Never keep a rejected promise around.
  value.catch(() => {
    if (store.get(key)?.value === value) store.delete(key);
  });

  if (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  return value;
}

/** Test helper. */
export function clearMemo(): void {
  store.clear();
}
