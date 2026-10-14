import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { connectEspnLeague } from "@/lib/league/service";
import { defaultEspnSeason } from "@/lib/season";
import { enforceRateLimit } from "@/lib/http/api-guard";

const ConnectBodySchema = z.object({
  mode: z.string().optional(),
  leagueId: z.union([z.string(), z.number()]).optional(),
  season: z.coerce.number().optional(),
  teamId: z.coerce.number().optional(),
  swid: z.string().optional(),
  espnS2: z.string().optional(),
});

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, {
    bucket: "league-connect",
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await request.json().catch(() => ({}));
  const parsed = ConnectBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const body = parsed.data;
  const mode = body.mode as string | undefined;

  try {
    if (mode === "demo") {
      return NextResponse.json(
        {
          error:
            "Demo leagues are no longer available. Connect an ESPN league, or use Trades tools without a league (full NFL player pool, full PPR).",
        },
        { status: 400 },
      );
    }

    const leagueId = String(body.leagueId ?? "").trim();
    const season = Number(body.season ?? defaultEspnSeason());
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
