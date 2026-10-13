"use client";

import { LeagueLocked } from "@/components/league-locked";

type Props = {
  title: string;
  message: string;
  /** Optional footer under the CTAs (e.g. install hint). */
  children?: React.ReactNode;
  className?: string;
};

/**
 * League-only empty state — connect guide + ESPN connect.
 * Never offers a demo league or fabricated stats.
 */
export function EmptyLeagueConnect({
  title,
  message,
  children,
  className,
}: Props) {
  return (
    <div className={className}>
      <LeagueLocked title={title} message={message} />
      {children}
    </div>
  );
}
