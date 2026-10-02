/**
 * Minimal CSV helpers for nflverse HTTPS downloads.
 * Supports plain CSV and gzip (.csv.gz). Never invents rows.
 */

import { gunzipSync } from "node:zlib";
import { parse } from "csv-parse/sync";

export type CsvRow = Record<string, string>;

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      Accept: "text/csv,application/octet-stream,*/*",
      "User-Agent": "GridironIQ/nflverse-ingest (attribution: nflverse CC-BY)",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`nflverse fetch failed ${res.status} for ${url}`);
  }
  if (url.endsWith(".gz")) {
    const buf = Buffer.from(await res.arrayBuffer());
    return gunzipSync(buf).toString("utf8");
  }
  return res.text();
}

export function parseCsv(text: string): CsvRow[] {
  const rows = parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    bom: true,
  }) as CsvRow[];
  return rows;
}

export async function fetchCsv(url: string): Promise<CsvRow[]> {
  const text = await fetchText(url);
  return parseCsv(text);
}

/** Parse a numeric cell; empty / NA / NaN → null (honesty: never invent). */
export function numOrNull(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || s === "NA" || s === "NaN" || s === "null") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function strOrNull(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s.length > 0 && s !== "NA" ? s : null;
}
