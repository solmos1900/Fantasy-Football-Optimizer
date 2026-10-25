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
 */
export function ConnectGuideHost() {
  const { data: session, status } = useSession();
  const isClient = useIsClient();
  const [dismissed, setDismissed] = useState(false);

  // Storage is read during render only after hydration (isClient), so SSR and
  // the first client render agree.
  const open =
    isClient &&
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
