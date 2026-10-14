/**
 * Server-only HTTP helper: timeouts, retries, zod parse.
 * Never import from client components — keeps provider URLs off the bundle.
 */

import { z } from "zod";

export type SecureFetchOptions = {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  headers?: HeadersInit;
  next?: RequestInit["next"];
  cache?: RequestInit["cache"];
};

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function secureFetch(
  url: string,
  options: SecureFetchOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: options.headers,
        next: options.next,
        cache: options.cache,
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timer);
      // Retry transient upstream errors
      if (res.status >= 500 && attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`secureFetch failed for ${url}`);
}

export async function secureFetchJson<T>(
  url: string,
  schema: z.ZodType<T>,
  options?: SecureFetchOptions,
): Promise<T> {
  const res = await secureFetch(url, options);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const raw: unknown = await res.json();
  return schema.parse(raw);
}

export async function secureFetchText(
  url: string,
  options?: SecureFetchOptions,
): Promise<string> {
  const res = await secureFetch(url, {
    ...options,
    headers: {
      Accept: "application/octet-stream,text/csv,*/*",
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.text();
}
