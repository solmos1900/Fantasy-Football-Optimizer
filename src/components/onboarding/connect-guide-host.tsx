"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { ConnectGuide } from "@/components/onboarding/connect-guide";
import {
  hasSeenConnectGuide,
  markConnectGuideSeen,
} from "@/lib/onboarding/storage";
import { useIsClient } from "@/lib/use-client-state";

/**
 * Mounts the connect guide once after account creation or guest entry.
 * Accounts: localStorage per userId. Guests: sessionStorage for this visit only.
 * Never shown when a league is already connected (e.g. a returning user on a
 * new device, where the "seen" flag is not in storage).
 */
export function ConnectGuideHost({ hasLeague = false }: { hasLeague?: boolean }) {
  const { data: session, status } = useSession();
  const isClient = useIsClient();
  const [dismissed, setDismissed] = useState(false);

  // Storage is read during render only after hydration (isClient), so SSR and
  // the first client render agree.
  const open =
    isClient &&
    !hasLeague &&
    !dismissed &&
    status === "authenticated" &&
    Boolean(session?.user?.id) &&
    !hasSeenConnectGuide({
      userId: session!.user!.id!,
      isGuest: Boolean(session?.user?.isGuest),
    });

  function dismiss() {
    if (session?.user?.id) {
      markConnectGuideSeen({
        userId: session.user.id,
        isGuest: Boolean(session.user.isGuest),
      });
    }
    setDismissed(true);
  }

  return <ConnectGuide open={open} onDismiss={dismiss} />;
}
