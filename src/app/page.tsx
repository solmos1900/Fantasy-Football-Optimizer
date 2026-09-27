import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand";
import { InstallHeroCta, InstallHowToLink } from "@/components/install-app";
import {
  LandingEntrance,
  LandingStage,
} from "@/components/landing-entrance";
import { PendingLink } from "@/components/pending-link";
import { buttonVariants } from "@/components/ui/button";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden pt-[env(safe-area-inset-top,0px)]">
      <LandingEntrance className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-16 pb-28">
        <LandingStage stage={1} className="mx-auto flex justify-center sm:mx-0 sm:justify-start">
          <BrandMark
            variant="hero"
            size={96}
            className="h-24 w-24 sm:h-[6.5rem] sm:w-[6.5rem]"
          />
        </LandingStage>

        <LandingStage
          stage={2}
          className="mx-auto mt-4 flex w-full max-w-xl flex-col items-center text-center sm:mx-0 sm:mt-5 sm:max-w-none sm:items-start sm:text-left"
        >
          <p className="type-brand text-5xl text-emerald-950 sm:text-7xl md:text-8xl">
            Gridiron IQ
          </p>
          <h1 className="mt-6 max-w-xl text-2xl font-semibold leading-snug tracking-tight text-emerald-950 sm:text-3xl">
            Own your league week with clearer starts, smarter adds, and live
            ESPN sync.
          </h1>
          <p className="type-body mt-4 max-w-lg text-emerald-950/65">
            Connect your fantasy league, see projected vs actual points, and get
            explainable recommendations — not black-box magic.
          </p>
        </LandingStage>

        <LandingStage stage={3}>
          <div className="mx-auto w-full max-w-md sm:mx-0">
            <InstallHeroCta />
          </div>

          <div className="mx-auto mt-6 flex flex-wrap items-center justify-center gap-3 sm:mx-0 sm:justify-start">
            <PendingLink
              href="/login?mode=account"
              className={buttonVariants({ variant: "primary", size: "lg" })}
            >
              Get started
            </PendingLink>
            <PendingLink
              href="/login?mode=guest"
              className={buttonVariants({ variant: "ghost", size: "lg" })}
            >
              Continue as Guest
            </PendingLink>
            <InstallHowToLink className="px-2 text-sm font-semibold text-emerald-950/70 underline-offset-2 hover:text-orange-700 hover:underline" />
          </div>
        </LandingStage>
      </LandingEntrance>
    </main>
  );
}
