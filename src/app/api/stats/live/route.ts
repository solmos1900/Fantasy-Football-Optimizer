import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLeagueDataForUser } from "@/lib/league/service";
import { getLiveStats } from "@/lib/stats/provider";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const league = await getLeagueDataForUser(session.user.id);
  const live = await getLiveStats(league);
  return NextResponse.json({ live, leagueId: league?.leagueId ?? null });
}
