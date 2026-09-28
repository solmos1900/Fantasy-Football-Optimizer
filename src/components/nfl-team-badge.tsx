import { cn } from "@/lib/utils";
import { normalizeNflAbbrev } from "@/lib/espn/pro-teams";

/**
 * Soft accent washes for NFL abbrev badges — not trademarked logo assets.
 * Prefer this over inventing logos when no licensed CDN/helper exists in-repo.
 */
const TEAM_ACCENT: Readonly<Record<string, string>> = {
  ARI: "#97233f",
  ATL: "#a71930",
  BAL: "#241773",
  BUF: "#00338d",
  CAR: "#0085ca",
  CHI: "#0b162a",
  CIN: "#fb4f14",
  CLE: "#311d00",
  DAL: "#002244",
  DEN: "#fb4f14",
  DET: "#0076b6",
  GB: "#203731",
  HOU: "#03202f",
  IND: "#002c5f",
  JAX: "#006778",
  KC: "#e31837",
  LAC: "#0080c6",
  LAR: "#003594",
  LV: "#a5acaf",
  MIA: "#008e97",
  MIN: "#4f2683",
  NE: "#002244",
  NO: "#d3bc8d",
  NYG: "#0b2265",
  NYJ: "#125740",
  PHI: "#004c54",
  PIT: "#ffb612",
  SEA: "#002244",
  SF: "#aa0000",
  TB: "#d50a0a",
  TEN: "#0c2340",
  WSH: "#5a1414",
};

function accentFor(abbrev: string): string {
  return TEAM_ACCENT[abbrev] ?? "#353535";
}

/** Tinted NFL team abbrev badge (no trademarked logo assets). */
export function NflTeamBadge({
  team,
  className,
}: {
  team: string;
  className?: string;
}) {
  const abbrev =
    normalizeNflAbbrev(team) ?? (team.trim().toUpperCase() || "?");
  if (abbrev === "FA") {
    return (
      <span
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[9px] font-bold tracking-wide text-emerald-950/45 ring-1 ring-emerald-950/15",
          className,
        )}
        style={{ background: "color-mix(in srgb, #ffffff 6%, transparent)" }}
        aria-hidden
      >
        FA
      </span>
    );
  }

  const accent = accentFor(abbrev);
  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[9px] font-bold tracking-wide ring-1",
        className,
      )}
      style={{
        background: `color-mix(in srgb, ${accent} 32%, #0b0b0b)`,
        color: `color-mix(in srgb, ${accent} 35%, #ffffff)`,
        borderColor: `color-mix(in srgb, ${accent} 45%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 40%, transparent)`,
      }}
      title={abbrev}
      aria-hidden
    >
      {abbrev.length > 3 ? abbrev.slice(0, 3) : abbrev}
    </span>
  );
}
