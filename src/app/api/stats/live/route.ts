import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLeagueDataForUser } from "@/lib/league/service";
import { getLiveStats } from "@/lib/stats/provider";
import { enforceRateLimit } from "@/lib/http/api-guard";

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, {
    bucket: "stats-live",
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const league = await getLeagueDataForUser(session.user.id);
  const live = await getLiveStats(league);
  return NextResponse.json({ live, leagueId: league?.leagueId ?? null });
}
