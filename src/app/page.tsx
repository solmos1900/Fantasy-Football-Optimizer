import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { InstallHeroCta, InstallHowToLink } from "@/components/install-app";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden pt-[env(safe-area-inset-top,0px)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2314532d' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-16 pb-28">
        <p className="animate-fade-up font-[family-name:var(--font-display)] text-5xl uppercase leading-none tracking-wide text-emerald-950 sm:text-7xl md:text-8xl">
          Gridiron IQ
        </p>
        <h1 className="animate-fade-up-delay mt-6 max-w-xl text-2xl font-semibold leading-snug text-emerald-950 sm:text-3xl">
          Own your league week with clearer starts, smarter adds, and live ESPN
          sync.
        </h1>
        <p className="animate-fade-up-delay-2 mt-4 max-w-lg text-base leading-relaxed text-emerald-950/65">
          Connect your fantasy league, see projected vs actual points, and get
          explainable recommendations — not black-box magic.
        </p>

        <InstallHeroCta />

        <div className="animate-fade-up-delay-2 mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/login"
            className="rounded-md bg-orange-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-orange-500"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="rounded-md border border-emerald-950/20 bg-white/60 px-6 py-3 text-sm font-semibold text-emerald-950 backdrop-blur transition hover:bg-white"
          >
            Continue as Guest
          </Link>
          <InstallHowToLink className="px-2 text-sm font-semibold text-emerald-950/70 underline-offset-2 hover:text-orange-700 hover:underline" />
        </div>
      </div>
    </main>
  );
}
