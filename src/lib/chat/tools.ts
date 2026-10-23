/**
 * Vercel AI SDK tools — model chooses which to call; numbers come from runners.
 */

import { tool } from "ai";
import { z } from "zod";
import type { ChatDataContext } from "@/lib/chat/player-resolve";
import { resolvePlayers } from "@/lib/chat/player-resolve";
import {
  leagueLockedResult,
  runPlayerOutlook,
  runTradeCompare,
  runWhoToStartCompare,
} from "@/lib/chat/tool-runners";
import { formatPlayerLabel } from "@/lib/insights/player-label";
import { resolveUserTeam } from "@/lib/league/service";

const espnIdList = z.array(z.number().int().positive()).min(1).max(8);

export function buildChatTools(ctx: ChatDataContext) {
  return {
    analyze_trade: tool({
      description:
        "Grade a fantasy trade between Left and Right using Gridiron IQ trade value (shared season points / trade logic). Pass ESPN player ids from @ mentions or templates.",
      inputSchema: z.object({
        leftEspnIds: espnIdList.describe("Left-side player ESPN ids"),
        rightEspnIds: espnIdList.describe("Right-side player ESPN ids"),
      }),
      execute: async ({ leftEspnIds, rightEspnIds }) => {
        const left = resolvePlayers(ctx, leftEspnIds);
        const right = resolvePlayers(ctx, rightEspnIds);
        if (left.missing.length || right.missing.length) {
          return {
            ok: false as const,
            kind: "trade" as const,
            message: `Could not resolve players: ${(
              [...left.missing, ...right.missing]
            ).join(", ")}`,
          };
        }
        return runTradeCompare({
          sideA: left.players,
          sideB: right.players,
          trends: ctx.trends,
          meta: ctx.meta,
          freshness: ctx.freshness,
        });
      },
    }),

    compare_who_to_start: tool({
      description:
        "Who to Start comparison for 2+ players using shared Gridiron IQ logic (Sleeper projected points, recent form, injury, matchup).",
      inputSchema: z.object({
        espnIds: z
          .array(z.number().int().positive())
          .min(2)
          .max(6)
          .describe("ESPN ids of players to compare"),
      }),
      execute: async ({ espnIds }) => {
        const resolved = resolvePlayers(ctx, espnIds);
        if (resolved.missing.length) {
          return {
            ok: false as const,
            kind: "who-to-start" as const,
            message: `Could not resolve players: ${resolved.missing.join(", ")}`,
          };
        }
        return runWhoToStartCompare({
          league: ctx.league,
          players: resolved.players,
          trends: ctx.trends,
          meta: ctx.meta,
          freshness: ctx.freshness,
        });
      },
    }),

    player_outlook: tool({
      description:
        "Points per game this season, last-3-game average, Sleeper projected points this week, injury, bye/matchup for one player.",
      inputSchema: z.object({
        espnId: z.number().int().positive(),
      }),
      execute: async ({ espnId }) => {
        const { players, missing } = resolvePlayers(ctx, [espnId]);
        if (missing.length || !players[0]) {
          return {
            ok: false as const,
            kind: "outlook" as const,
            message: `Player ${espnId} not found in the NFL pool.`,
          };
        }
        return runPlayerOutlook({
          player: players[0],
          meta: ctx.meta,
          freshness: ctx.freshness,
        });
      },
    }),

    waiver_outlook: tool({
      description:
        "Evaluate a free-agent / waiver pickup target with the same outlook metrics.",
      inputSchema: z.object({
        espnId: z.number().int().positive(),
      }),
      execute: async ({ espnId }) => {
        const { players, missing } = resolvePlayers(ctx, [espnId]);
        if (missing.length || !players[0]) {
          return {
            ok: false as const,
            kind: "outlook" as const,
            message: `Player ${espnId} not found.`,
          };
        }
        const outlook = runPlayerOutlook({
          player: players[0],
          meta: ctx.meta,
          freshness: ctx.freshness,
        });
        return { ...outlook, kind: "waiver" as const };
      },
    }),

    my_roster: tool({
      description:
        "List the signed-in user's roster. Only available with a connected league.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!ctx.hasConnectedLeague) {
          return leagueLockedResult("your roster");
        }
        const team = resolveUserTeam(ctx.league);
        if (!team) {
          return leagueLockedResult("your roster (pick your team on Connect)");
        }
        return {
          ok: true as const,
          kind: "roster" as const,
          teamName: team.name,
          players: team.roster.map((p) => ({
            espnId: p.espnId,
            label: formatPlayerLabel(p.name, p.nflTeam),
            position: p.position,
            slot: p.slot ?? null,
            injuryStatus: p.injuryStatus,
          })),
        };
      },
    }),

    league_teams: tool({
      description:
        "List league team names and records. Only with a connected league.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!ctx.hasConnectedLeague) {
          return leagueLockedResult("league teams");
        }
        return {
          ok: true as const,
          kind: "league-teams" as const,
          leagueName: ctx.league.name,
          teams: ctx.league.teams.map((t) => ({
            id: t.id,
            name: t.name,
            record: `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`,
            standing: t.standing,
          })),
        };
      },
    }),
  };
}

export type ChatTools = ReturnType<typeof buildChatTools>;
