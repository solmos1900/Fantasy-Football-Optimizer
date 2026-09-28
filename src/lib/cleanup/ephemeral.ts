import { prisma } from "@/lib/db";
import {
  CACHED_PAYLOAD_MAX_CHARS,
  guestTtlHoursFromEnv,
} from "@/lib/cleanup/constants";

export {
  CACHED_PAYLOAD_MAX_CHARS,
  DEFAULT_GUEST_TTL_HOURS,
  guestTtlHoursFromEnv,
} from "@/lib/cleanup/constants";

export type CleanupResult = {
  guestsDeleted: number;
  sessionsDeleted: number;
  verificationTokensDeleted: number;
  oversizedPayloadsCleared: number;
  orphanWeekStatsDeleted: number;
  orphanTrendsDeleted: number;
  demoStatsDeleted: number;
  guestTtlHours: number;
  cutoffIso: string;
};

/**
 * Delete a guest user and cascaded rows (LeagueConnection, Account, Session).
 * No-op for real accounts. Safe to call on sign-out.
 */
export async function deleteGuestUserById(userId: string): Promise<boolean> {
  if (!userId) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isGuest: true },
  });
  if (!user?.isGuest) return false;
  await prisma.user.delete({ where: { id: user.id } });
  return true;
}

/**
 * Scheduled / on-demand purge of ephemeral rows:
 * - Guest users older than TTL (and cascaded league caches / cookies)
 * - Expired Auth.js Session rows (DB adapter leftovers; JWT is primary)
 * - Expired VerificationToken rows
 * - Oversized cachedPayload blobs (any user) — keeps the connection row
 *
 * Never deletes non-guest users or their ESPN league links.
 */
export async function runEphemeralCleanup(options?: {
  guestTtlHours?: number;
  now?: Date;
}): Promise<CleanupResult> {
  const guestTtlHours = options?.guestTtlHours ?? guestTtlHoursFromEnv();
  const now = options?.now ?? new Date();
  const cutoff = new Date(now.getTime() - guestTtlHours * 60 * 60 * 1000);

  const guestDelete = await prisma.user.deleteMany({
    where: {
      isGuest: true,
      createdAt: { lt: cutoff },
    },
  });

  const sessionsDeleted = await prisma.session.deleteMany({
    where: { expires: { lt: now } },
  });

  const verificationTokensDeleted = await prisma.verificationToken.deleteMany({
    where: { expires: { lt: now } },
  });

  // Postgres char_length — avoid loading full JSON blobs into the Node process.
  const oversized = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "LeagueConnection"
    WHERE "cachedPayload" IS NOT NULL
      AND char_length("cachedPayload") > ${CACHED_PAYLOAD_MAX_CHARS}
  `;

  let oversizedPayloadsCleared = 0;
  if (oversized.length > 0) {
    const ids = oversized.map((r) => r.id);
    const cleared = await prisma.leagueConnection.updateMany({
      where: { id: { in: ids } },
      data: { cachedPayload: null },
    });
    oversizedPayloadsCleared = cleared.count;
  }

  // Drop week/trend rows for leagueIds no connection still references (guest ESPN
  // leftovers). Never runs a blanket delete when the connection table is empty.
  let orphanWeekStatsDeleted = 0;
  let orphanTrendsDeleted = 0;
  const active = await prisma.leagueConnection.findMany({
    select: { leagueId: true },
    distinct: ["leagueId"],
  });
  if (active.length > 0) {
    const activeIds = active.map((r) => r.leagueId);
    const orphanWeeks = await prisma.playerWeekStat.deleteMany({
      where: {
        leagueId: { notIn: activeIds, not: "" },
      },
    });
    orphanWeekStatsDeleted = orphanWeeks.count;
    const orphanTrends = await prisma.playerTrendSnapshot.deleteMany({
      where: {
        leagueId: { notIn: activeIds, not: "" },
      },
    });
    orphanTrendsDeleted = orphanTrends.count;
  }

  // Historical demo upserts (we no longer persist demo trends).
  const demoWeeks = await prisma.playerWeekStat.deleteMany({
    where: { OR: [{ source: "demo" }, { actualSource: "demo" }] },
  });
  const demoTrends = await prisma.playerTrendSnapshot.deleteMany({
    where: { leagueId: "demo-league" },
  });
  const demoStatsDeleted = demoWeeks.count + demoTrends.count;

  return {
    guestsDeleted: guestDelete.count,
    sessionsDeleted: sessionsDeleted.count,
    verificationTokensDeleted: verificationTokensDeleted.count,
    oversizedPayloadsCleared,
    orphanWeekStatsDeleted,
    orphanTrendsDeleted,
    demoStatsDeleted,
    guestTtlHours,
    cutoffIso: cutoff.toISOString(),
  };
}
