import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, githubOAuthConfigured, googleOAuthConfigured } from "@/lib/auth";
import { LoginActions } from "@/components/login-actions";
import { InstallHowToLink } from "@/components/install-app";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const params = await searchParams;
  const authError = params.error;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16 pt-[max(4rem,env(safe-area-inset-top,0px))]">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="font-[family-name:var(--font-display)] text-3xl uppercase tracking-wide text-emerald-950"
        >
          Gridiron IQ
        </Link>
        <p className="mt-2 text-sm text-emerald-950/60">
          Sign in with Google, GitHub, email, or continue as a guest to try the
          product.
        </p>

        {authError && (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Sign-in error: {authError}. Try again, or use email/password or Guest
            if OAuth is not configured.
          </p>
        )}

        <div className="mt-8 rounded-lg border border-emerald-950/10 bg-[#F4F7F5]/90 p-6 shadow-sm backdrop-blur">
          <LoginActions
            googleEnabled={googleOAuthConfigured}
            githubEnabled={githubOAuthConfigured}
          />
        </div>

        <p className="mt-6 text-center text-xs text-emerald-950/50">
          Want a Home Screen icon? <InstallHowToLink />
        </p>
      </div>
    </main>
  );
}
