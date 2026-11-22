import type { Metadata } from "next";
import Link from "next/link";
import { BrandWordmark } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found · Gridiron IQ",
};

/** Branded 404 for unknown URLs (and routes that call notFound()). */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-6 px-4 py-12">
      <Link href="/" aria-label="Gridiron IQ home">
        <BrandWordmark markSize={32} className="[&_.type-brand]:text-2xl" />
      </Link>
      <div className="space-y-2">
        <h1 className="type-page text-emerald-950">Page not found</h1>
        <p className="type-body text-emerald-950/65">
          That page doesn&apos;t exist or has moved.
        </p>
      </div>
      <div>
        <Link href="/dashboard" className={buttonVariants({ variant: "primary" })}>
          Back to Home
        </Link>
      </div>
    </main>
  );
}
