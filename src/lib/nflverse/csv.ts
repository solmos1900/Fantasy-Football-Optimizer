/**
 * Minimal CSV helpers for nflverse release assets (no Python).
 * Handles gzip via global DecompressionStream / node zlib.
 */

import { gunzipSync } from "node:zlib";
import { secureFetch, secureFetchText } from "@/lib/http/secure-fetch";

export type CsvRow = Record<string, string>;

export async function fetchText(url: string): Promise<string> {
  return secureFetchText(url, { timeoutMs: 60_000, retries: 2 });
}

export type GunzipFetchMeta = {
  text: string;
  url: string;
  /** HTTP Last-Modified header when the CDN provides one (ISO or raw). */
  lastModified: string | null;
  /** HTTP Date header as a fallback publish hint. */
  responseDate: string | null;
};

function headerOrNull(res: Response, name: string): string | null {
  const raw = res.headers.get(name)?.trim();
  return raw && raw.length > 0 ? raw : null;
}

/** Normalize Last-Modified / Date into ISO when parseable; else keep raw. */
export function normalizeHttpDate(raw: string | null): string | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (Number.isFinite(ms)) return new Date(ms).toISOString();
  return raw;
}

export async function fetchGunzipTextWithMeta(
  url: string,
): Promise<GunzipFetchMeta> {
  const res = await secureFetch(url, {
    timeoutMs: 90_000,
    retries: 2,
    headers: { Accept: "application/gzip,application/octet-stream,*/*" },
  });
  if (!res.ok) {
    throw new Error(`nflverse fetch failed ${res.status} for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    text: gunzipSync(buf).toString("utf8"),
    url,
    lastModified: normalizeHttpDate(headerOrNull(res, "last-modified")),
    responseDate: normalizeHttpDate(headerOrNull(res, "date")),
  };
}

export async function fetchGunzipText(url: string): Promise<string> {
  const { text } = await fetchGunzipTextWithMeta(url);
  return text;
}

/** RFC4180-ish CSV parse (quoted fields, commas, newlines). */
export function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (c === "\r") {
      i += 1;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) return [];

  const header = rows[0]!.map((h) => h.trim());
  const out: CsvRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]!;
    const obj: CsvRow = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c]!] = (cells[c] ?? "").trim();
    }
    out.push(obj);
  }
  return out;
}

export function parseOptionalFloat(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === "" || s.toLowerCase() === "na" || s.toLowerCase() === "null") {
    return null;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseOptionalInt(raw: string | undefined | null): number | null {
  const n = parseOptionalFloat(raw);
  if (n == null) return null;
  return Math.trunc(n);
}
