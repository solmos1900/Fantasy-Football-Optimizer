import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand";
import { InstallHeroCta, InstallHowToLink } from "@/components/install-app";
import { buttonVariants } from "@/components/ui/button";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden pt-[env(safe-area-inset-top,0px)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%231B3022' fill-opacity='0.04'%3E%3Cpath d='M0 0h40v40H0V0zm40 40h40v40H40V40z'/%3E%3C/g%3E%3C/svg%3E\")",
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-16 pb-28">
        <div className="animate-fade-up flex flex-col items-start gap-5">
          <BrandMark size={72} className="shadow-[0_8px_28px_-12px_rgba(27,48,34,0.35)]" />
          <p className="type-brand text-5xl text-emerald-950 sm:text-7xl md:text-8xl">
            Gridiron IQ
          </p>
        </div>
        <h1 className="animate-fade-up-delay mt-6 max-w-xl text-2xl font-semibold leading-snug tracking-tight text-emerald-950 sm:text-3xl">
          Own your league week with clearer starts, smarter adds, and live ESPN
          sync.
        </h1>
        <p className="animate-fade-up-delay-2 type-body mt-4 max-w-lg text-emerald-950/65">
          Connect your fantasy league, see projected vs actual points, and get
          explainable recommendations — not black-box magic.
        </p>

        <InstallHeroCta />

        <div className="animate-fade-up-delay-2 mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/login?mode=account"
            className={buttonVariants({ variant: "primary", size: "lg" })}
          >
            Get started
          </Link>
          <Link
            href="/login?mode=guest"
            className={buttonVariants({ variant: "ghost", size: "lg" })}
          >
            Continue as Guest
          </Link>
          <InstallHowToLink className="px-2 text-sm font-semibold text-emerald-950/70 underline-offset-2 hover:text-orange-700 hover:underline" />
        </div>
      </div>
    </main>
  );
}
