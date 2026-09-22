import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDemoLeague, connectEspnLeague } from "@/lib/league/service";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const mode = body.mode as string | undefined;

  try {
    if (mode === "demo") {
      const league = await connectDemoLeague(session.user.id);
      return NextResponse.json({ ok: true, league });
    }

    const leagueId = String(body.leagueId ?? "").trim();
    const season = Number(body.season ?? process.env.DEFAULT_ESPN_SEASON ?? 2025);
    if (!leagueId) {
      return NextResponse.json({ error: "leagueId is required" }, { status: 400 });
    }

    const league = await connectEspnLeague(session.user.id, {
      leagueId,
      season,
      teamId: body.teamId ? Number(body.teamId) : undefined,
      swid: body.swid ? String(body.swid) : undefined,
      espnS2: body.espnS2 ? String(body.espnS2) : undefined,
    });

    return NextResponse.json({ ok: true, league });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to connect league";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
