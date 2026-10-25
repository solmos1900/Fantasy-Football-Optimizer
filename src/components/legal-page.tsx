import Link from "next/link";
import type { ReactNode } from "react";
import { BrandWordmark } from "@/components/brand";
import { PendingLink } from "@/components/pending-link";

export const LEGAL_LAST_UPDATED = "October 25, 2026";

/** Support address shown on legal pages; set NEXT_PUBLIC_SUPPORT_EMAIL. */
export function supportEmail(): string | null {
  return process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || null;
}

export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const email = supportEmail();
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12 pt-[max(3rem,env(safe-area-inset-top,0px))]">
      <PendingLink href="/">
        <BrandWordmark markSize={32} className="[&_.type-brand]:text-2xl" />
      </PendingLink>
      <h1 className="type-page mt-8 text-emerald-950">{title}</h1>
      <p className="type-caption mt-2 text-emerald-950/50">
        Last updated {LEGAL_LAST_UPDATED}
      </p>
      <div className="legal-body type-body mt-8 space-y-6 text-sm leading-relaxed text-emerald-950/75 [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-emerald-950 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
        {children}
        {email && (
          <>
            <h2>Contact</h2>
            <p>
              Questions or requests:{" "}
              <a className="underline underline-offset-2" href={`mailto:${email}`}>
                {email}
              </a>
            </p>
          </>
        )}
      </div>
      <p className="type-caption mt-12 text-emerald-950/50">
        <Link href="/terms" className="underline underline-offset-2">Terms</Link>
        {" · "}
        <Link href="/privacy" className="underline underline-offset-2">Privacy</Link>
        {" · "}
        <Link href="/" className="underline underline-offset-2">Home</Link>
      </p>
    </main>
  );
}
