/**
 * First-run connect guide: persist "seen" for real accounts; session-only for guests.
 */

const ACCOUNT_KEY_PREFIX = "giq-connect-guide-seen:";
const GUEST_KEY = "giq-connect-guide-seen-guest";

export function hasSeenConnectGuide(options: {
  userId: string;
  isGuest: boolean;
}): boolean {
  if (typeof window === "undefined") return true;
  try {
    if (options.isGuest) {
      return sessionStorage.getItem(GUEST_KEY) === "1";
    }
    return (
      localStorage.getItem(`${ACCOUNT_KEY_PREFIX}${options.userId}`) === "1"
    );
  } catch {
    return false;
  }
}

export function markConnectGuideSeen(options: {
  userId: string;
  isGuest: boolean;
}): void {
  if (typeof window === "undefined") return;
  try {
    if (options.isGuest) {
      sessionStorage.setItem(GUEST_KEY, "1");
      return;
    }
    localStorage.setItem(`${ACCOUNT_KEY_PREFIX}${options.userId}`, "1");
  } catch {
    // Private mode / blocked storage — guide may reappear; never crash.
  }
}
