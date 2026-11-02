/**
 * Confirms a signed-in user's row still exists, caching positive answers for a
 * minute so the JWT callback doesn't hit the database on every request.
 * Deleted accounts (and cleaned-up guests) stop being treated as signed in.
 */

export const USER_EXISTS_CACHE_MS = 60_000;

const verifiedAt = new Map<string, number>();

export type UserExistsLookup = (id: string) => Promise<boolean>;

export async function userStillExists(
  id: string,
  lookup: UserExistsLookup,
  now: number = Date.now(),
): Promise<boolean> {
  const last = verifiedAt.get(id);
  if (last !== undefined && now - last < USER_EXISTS_CACHE_MS) return true;
  const exists = await lookup(id);
  if (exists) {
    if (verifiedAt.size > 5_000) verifiedAt.clear();
    verifiedAt.set(id, now);
  } else {
    verifiedAt.delete(id);
  }
  return exists;
}

export function forgetVerifiedUser(id: string): void {
  verifiedAt.delete(id);
}

export function resetUserExistsCache(): void {
  verifiedAt.clear();
}
