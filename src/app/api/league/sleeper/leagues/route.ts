import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/http/api-guard";
import { defaultEspnSeason } from "@/lib/season";
import {
  fetchSleeperUser,
  fetchSleeperUserLeagues,
  sleeperScoringLabel,
} from "@/lib/sleeper/league";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  username: z.string().trim().min(1).max(40),
  season: z.coerce.number().int().min(2018).max(2100).optional(),
});

/** List a Sleeper user's NFL leagues for the Connect picker. */
export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, {
    bucket: "sleeper-leagues",
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    username: url.searchParams.get("username") ?? "",
    season: url.searchParams.get("season") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a Sleeper username." }, { status: 400 });
  }
  const season = parsed.data.season ?? defaultEspnSeason();

  try {
    const user = await fetchSleeperUser(parsed.data.username);
    if (!user) {
      return NextResponse.json(
        { error: "We couldn't find that Sleeper username." },
        { status: 404 },
      );
    }
    const leagues = await fetchSleeperUserLeagues(user.userId, season);
    return NextResponse.json({
      user,
      season,
      leagues: leagues.map((l) => ({
        leagueId: l.league_id,
        name: l.name ?? `League ${l.league_id}`,
        teams: l.total_rosters ?? null,
        status: l.status ?? null,
        scoring: sleeperScoringLabel(l.scoring_settings, l.roster_positions),
      })),
    });
  } catch (err) {
    console.error("[league/sleeper/leagues] failed", err);
    return NextResponse.json(
      { error: "Could not reach Sleeper. Try again in a minute." },
      { status: 502 },
    );
  }
}
