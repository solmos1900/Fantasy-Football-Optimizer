import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginActions } from "@/components/login-actions";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  const githubEnabled = Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="font-[family-name:var(--font-display)] text-3xl uppercase tracking-wide text-emerald-950"
        >
          Gridiron IQ
        </Link>
        <p className="mt-2 text-sm text-emerald-950/60">
          Sign in to sync your ESPN league and unlock insights.
        </p>

        <div className="mt-8 rounded-lg border border-emerald-950/10 bg-[#F4F7F5]/90 p-6 shadow-sm backdrop-blur">
          <LoginActions googleEnabled={googleEnabled} githubEnabled={githubEnabled} />
        </div>
      </div>
    </main>
  );
}
