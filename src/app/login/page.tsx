import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, githubOAuthConfigured, googleOAuthConfigured } from "@/lib/auth";
import { BrandWordmark } from "@/components/brand";
import { LoginActions, type LoginFlow } from "@/components/login-actions";
import { InstallHowToLink } from "@/components/install-app";

function resolveFlow(mode: string | undefined): LoginFlow {
  return mode === "guest" ? "guest" : "account";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; mode?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const params = await searchParams;
  const authError = params.error;
  const flow = resolveFlow(params.mode);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16 pt-[max(4rem,env(safe-area-inset-top,0px))]">
      <div className="w-full max-w-md">
        <Link href="/">
          <BrandWordmark markSize={40} className="[&_.type-brand]:text-3xl" />
        </Link>
        <p className="type-body mt-3 text-emerald-950/60">
          {flow === "guest"
            ? "Continue as a guest to try the product — no account required."
            : "Sign in with Google, GitHub, or email to sync your ESPN league."}
        </p>

        {authError && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Sign-in error: {authError}. Try again, or use email/password or Guest
            if OAuth is not configured.
          </p>
        )}

        <div className="surface-card mt-8 p-6">
          <LoginActions
            googleEnabled={googleOAuthConfigured}
            githubEnabled={githubOAuthConfigured}
            flow={flow}
          />
        </div>

        <p className="type-caption mt-6 text-center text-emerald-950/50">
          Want a Home Screen icon? <InstallHowToLink />
        </p>
      </div>
    </main>
  );
}
