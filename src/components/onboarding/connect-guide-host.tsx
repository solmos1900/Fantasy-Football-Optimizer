"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ConnectGuide } from "@/components/onboarding/connect-guide";
import {
  hasSeenConnectGuide,
  markConnectGuideSeen,
} from "@/lib/onboarding/storage";

/**
 * Mounts the connect guide once after account creation or guest entry.
 * Accounts: localStorage per userId. Guests: sessionStorage for this visit only.
 */
export function ConnectGuideHost() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) return;
    const isGuest = Boolean(session.user.isGuest);
    if (
      hasSeenConnectGuide({
        userId: session.user.id,
        isGuest,
      })
    ) {
      return;
    }
    setOpen(true);
  }, [status, session?.user?.id, session?.user?.isGuest]);

  function dismiss() {
    if (session?.user?.id) {
      markConnectGuideSeen({
        userId: session.user.id,
        isGuest: Boolean(session.user.isGuest),
      });
    }
    setOpen(false);
  }

  return <ConnectGuide open={open} onDismiss={dismiss} />;
}
