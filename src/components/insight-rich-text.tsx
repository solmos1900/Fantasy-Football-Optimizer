import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Kraft paper player-name chip — named entity on the draft board. */
export function PlayerChip({
  name,
  tone = "primary",
  className,
}: {
  name: string;
  tone?: "primary" | "secondary";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate rounded-md border px-1.5 py-0.5 align-baseline text-[0.8125rem] font-semibold leading-snug",
        tone === "primary"
          ? "border-emerald-900 bg-emerald-900 text-emerald-50 shadow-sm"
          : "border-emerald-950/25 bg-[color-mix(in_srgb,var(--kraft)_55%,var(--surface))] text-emerald-950",
        className,
      )}
    >
      {name}
    </span>
  );
}

/** Burgundy tabular number callout for projections / averages. */
export function StatCallout({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline rounded px-1 py-0.5 font-semibold tabular-nums text-orange-800",
        "bg-orange-100/90",
        className,
      )}
    >
      {children}
    </span>
  );
}

const INJURY_WORDS = ["QUESTIONABLE", "DOUBTFUL", "SUSPENSION", "OUT", "IR"] as const;

type Token =
  | { kind: "text"; value: string }
  | { kind: "name"; value: string; primary: boolean }
  | { kind: "stat"; value: string }
  | { kind: "injury"; value: string }
  | { kind: "verdict"; value: string };

function tokenize(text: string, names: string[]): Token[] {
  const unique = [...new Set(names.filter(Boolean))];
  // First name in the list is the primary entity; longest-first matching avoids
  // partial overlaps (e.g. "Josh" inside "Josh Allen").
  const primary = unique[0] ?? null;
  const sortedNames = [...unique].sort((a, b) => b.length - a.length);
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const parts: string[] = [];
  if (sortedNames.length) {
    parts.push(`(?<name>${sortedNames.map(escape).join("|")})`);
  }
  // Keep START/SIT as tokens so we can bold them — not full chips (stamp covers that).
  parts.push(`(?<verdict>\\b(?:START|SIT)\\b)`);
  parts.push(`(?<injury>\\b(?:${INJURY_WORDS.join("|")})\\b)`);
  parts.push(`(?<stat>\\+?-?\\d+(?:\\.\\d+)?)`);
  // Case-insensitive so raw "ir" from copy still highlights as IR
  const re = new RegExp(parts.join("|"), "gi");

  const tokens: Token[] = [];
  let last = 0;
  for (const match of text.matchAll(re)) {
    const index = match.index ?? 0;
    if (index > last) {
      tokens.push({ kind: "text", value: text.slice(last, index) });
    }
    const groups = match.groups ?? {};
    if (groups.name) {
      tokens.push({
        kind: "name",
        value: groups.name,
        primary: groups.name === primary,
      });
    } else if (groups.verdict) {
      tokens.push({ kind: "verdict", value: groups.verdict.toUpperCase() });
    } else if (groups.injury) {
      tokens.push({ kind: "injury", value: groups.injury.toUpperCase() });
    } else if (groups.stat) {
      tokens.push({ kind: "stat", value: groups.stat });
    }
    last = index + match[0].length;
  }
  if (last < text.length) {
    tokens.push({ kind: "text", value: text.slice(last) });
  }
  return tokens;
}

/**
 * Render insight prose with player-name chips and highlighted numbers / injury words.
 * Pass related player names (longest match wins). First name is treated as primary chip.
 * START/SIT render as bold accent text (not chips) so card headers stay scannable.
 */
export function InsightRichText({
  text,
  names = [],
  emphasize = false,
  className,
}: {
  text: string;
  names?: string[];
  /** Stronger body (why punch line). */
  emphasize?: boolean;
  className?: string;
}) {
  const tokens = tokenize(text, names);

  return (
    <span
      className={cn(
        emphasize
          ? "text-[0.9375rem] font-medium leading-relaxed text-emerald-950"
          : "leading-relaxed text-emerald-950/75",
        className,
      )}
    >
      {tokens.map((t, i) => {
        if (t.kind === "text") return <span key={i}>{t.value}</span>;
        if (t.kind === "name") {
          return (
            <PlayerChip
              key={i}
              name={t.value}
              tone={t.primary ? "primary" : "secondary"}
            />
          );
        }
        if (t.kind === "verdict") {
          return (
            <span
              key={i}
              className={cn(
                "font-bold tracking-wide",
                t.value === "START" ? "text-emerald-800" : "text-orange-800",
              )}
            >
              {t.value}
            </span>
          );
        }
        if (t.kind === "stat") {
          return <StatCallout key={i}>{t.value}</StatCallout>;
        }
        return (
          <span
            key={i}
            className="inline-flex rounded px-1.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-white bg-orange-700"
          >
            {t.value}
          </span>
        );
      })}
    </span>
  );
}
