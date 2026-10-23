import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  rankMentionHits,
  type MentionPlayer,
} from "@/lib/chat/mention-search";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().max(64).optional().default(""),
  limit: z.coerce.number().int().min(1).max(12).optional().default(8),
});

/**
 * Fast @-mention typeahead over the Player table (Neon).
 * Auth required (app shell already gates guests/accounts).
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    limit: url.searchParams.get("limit") ?? 8,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const { q, limit } = parsed.data;
  const trimmed = q.trim();

  // Prefetch a bounded candidate set — DB filter when query has 2+ chars.
  let rows: MentionPlayer[];
  if (trimmed.length >= 2) {
    rows = await prisma.player.findMany({
      where: {
        OR: [
          { name: { contains: trimmed, mode: "insensitive" } },
          { nflTeam: { equals: trimmed.toUpperCase(), mode: "insensitive" } },
        ],
      },
      select: {
        espnId: true,
        name: true,
        position: true,
        nflTeam: true,
      },
      take: 40,
      orderBy: { name: "asc" },
    });
  } else {
    rows = await prisma.player.findMany({
      where: { position: { in: ["QB", "RB", "WR", "TE"] } },
      select: {
        espnId: true,
        name: true,
        position: true,
        nflTeam: true,
      },
      take: 30,
      orderBy: { name: "asc" },
    });
  }

  const hits = rankMentionHits(rows, trimmed, limit);
  return NextResponse.json({
    players: hits.map((h) => ({
      espnId: h.espnId,
      name: h.name,
      position: h.position,
      nflTeam: h.nflTeam,
      label: h.label,
    })),
  });
}
