/**
 * Self-serve account deletion (signed-in users and guests).
 *
 * Deleting the User cascades Account, Session, LeagueConnection (incl.
 * encrypted ESPN cookies + cached league snapshot) and ChatConversation /
 * ChatMessage. Rows keyed by user id without a foreign key are handled here:
 * chat counters are deleted, ChatUsage is kept for cost accounting but
 * detached from the user. League-scoped stat rows left without a connection
 * are removed by the daily cleanup cron (orphan sweep).
 */

import { prisma } from "@/lib/db";
import { forgetVerifiedUser } from "@/lib/auth/user-exists";
import { tokenBucketKey, userBucketKey } from "@/lib/chat/rate-limit";

export const ACCOUNT_DELETE_CONFIRMATION = "DELETE";

export function isDeleteConfirmed(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.trim().toUpperCase() === ACCOUNT_DELETE_CONFIRMATION
  );
}

export async function deleteUserAccount(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!user) return false;

  const userBucket = userBucketKey(user.id);
  await prisma.$transaction([
    prisma.chatUsage.updateMany({
      where: { userId: user.id },
      data: { userId: null, conversationId: null },
    }),
    prisma.chatRateLimit.deleteMany({
      where: { bucketKey: { in: [userBucket, tokenBucketKey(userBucket)] } },
    }),
    ...(user.email
      ? [
          prisma.emailVerificationChallenge.deleteMany({
            where: { email: user.email },
          }),
          prisma.verificationToken.deleteMany({
            where: { identifier: user.email },
          }),
        ]
      : []),
    prisma.user.delete({ where: { id: user.id } }),
  ]);
  forgetVerifiedUser(user.id);
  return true;
}
