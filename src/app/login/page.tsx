import { redirect } from "next/navigation";
import { auth, githubOAuthConfigured, googleOAuthConfigured } from "@/lib/auth";
import { BrandWordmark } from "@/components/brand";
import { LoginActions, type LoginFlow } from "@/components/login-actions";
import { InstallHowToLink } from "@/components/install-app";
import { PendingLink } from "@/components/pending-link";

function resolveFlow(mode: string | undefined): LoginFlow {
  return mode === "guest" ? "guest" : "account";
}

function authErrorMessage(error: string): string {
  if (error === "OAuthAccountNotLinked") {
    return "This email already has a password account. Sign in with email/password instead — or try Google/GitHub again after account linking is enabled on this deployment.";
  }
  return `Sign-in error: ${error}. Try again, or use email/password or Guest.`;
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
        <PendingLink href="/">
          <BrandWordmark markSize={40} className="[&_.type-brand]:text-3xl" />
        </PendingLink>
        <p className="type-body mt-3 text-emerald-950/60">
          {flow === "guest"
            ? "Continue as a guest to try the product — no account required."
            : "Sign in with Google, GitHub, or email to sync your ESPN league."}
        </p>

        {authError && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {authErrorMessage(authError)}
          </p>
        )}

        <div className="surface-card mt-8 p-6">
          <LoginActions
            googleEnabled={googleOAuthConfigured}
            githubEnabled={githubOAuthConfigured}
            flow={flow}
          />
        </div>

        <div className="mt-6 flex justify-center">
          <InstallHowToLink
            className="inline-flex min-h-11 max-w-full flex-wrap items-center justify-center gap-x-1 rounded-lg px-3 py-2 text-center text-sm text-emerald-950/55 underline-offset-2 hover:bg-white/5 hover:text-emerald-950/80"
          >
            <span>Want a Home Screen icon?</span>
            <span className="font-semibold text-orange-700 underline">
              How to install
            </span>
          </InstallHowToLink>
        </div>
      </div>
    </main>
  );
}
