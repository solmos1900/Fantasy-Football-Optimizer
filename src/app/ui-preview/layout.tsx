import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Design / QA previews with sample data. Never served in production: 404
 * unless NODE_ENV=development or NEXT_PUBLIC_ALLOW_UI_PREVIEW=1 (e.g. a
 * screenshot build). Checked on the server so no preview HTML ships.
 */
export default function UiPreviewLayout({ children }: { children: ReactNode }) {
  const allowed =
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_ALLOW_UI_PREVIEW === "1";
  if (!allowed) notFound();
  return children;
}
