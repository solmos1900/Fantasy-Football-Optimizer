"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { PendingLink } from "@/components/pending-link";
import { cn } from "@/lib/utils";
import { scrollToTopNow } from "@/components/scroll-to-top";

type FormMode = "signin" | "register" | "verify";
export type LoginFlow = "account" | "guest";

export function LoginActions({
  googleEnabled,
  githubEnabled,
  flow = "account",
}: {
  googleEnabled: boolean;
  githubEnabled: boolean;
  flow?: LoginFlow;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formMode, setFormMode] = useState<FormMode>("signin");
  const [name, setName] = useState("");
  const [guestName, setGuestName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function goDashboard() {
    // Avoid Auth.js client redirect races that briefly hit a broken route / 404.
    // Reset scroll before navigation so post-login never opens mid-page.
    scrollToTopNow();
    router.replace("/dashboard");
    router.refresh();
  }

  function handleGuest() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await signIn("guest", {
        name: guestName.trim() || "Guest",
        redirect: false,
      });
      if (result?.error) {
        setError("Guest sign-in failed. Check AUTH_SECRET and DATABASE_URL.");
        return;
      }
      goDashboard();
    });
  }

  function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    startTransition(async () => {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          code: code.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Verification failed.");
        return;
      }

      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Email verified — sign in with your password.");
        setFormMode("signin");
        setCode("");
        return;
      }

      goDashboard();
    });
  }

  function handleResend() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password: password || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        devCode?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not resend code.");
        return;
      }
      setInfo(
        data.devCode
          ? `New code sent (dev): ${data.devCode}`
          : "A new verification code was sent to your email.",
      );
    });
  }

  function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    startTransition(async () => {
      if (formMode === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim() || undefined,
            email: email.trim(),
            password,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          needsVerification?: boolean;
          devCode?: string;
        };
        if (!res.ok) {
          setError(data.error ?? "Registration failed.");
          return;
        }

        setFormMode("verify");
        setCode(data.devCode ?? "");
        setInfo(
          data.devCode
            ? `Enter the code sent to your email (dev code: ${data.devCode}).`
            : "We sent a 6-digit code to your email. Enter it below to finish creating your account.",
        );
        return;
      }

      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(
          "Invalid email or password — or your email is not verified yet. Create an account / enter your verification code if you just signed up.",
        );
        return;
      }

      goDashboard();
    });
  }

  function handleOAuth(provider: "google" | "github") {
    setError(null);
    startTransition(() => {
      void signIn(provider, { callbackUrl: "/dashboard" });
    });
  }

  if (flow === "guest") {
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <label className="block text-sm">
            <span className="mb-1.5 block text-emerald-950/60">Display name</span>
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Guest"
              autoComplete="nickname"
              className="field-input"
            />
          </label>
          <Button
            type="button"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={pending}
            loading={pending}
            onClick={handleGuest}
          >
            {pending ? "Working…" : "Continue as Guest"}
          </Button>
          <p className="type-caption leading-relaxed text-emerald-950/50">
            Guest mode creates a temporary session so you can try Trade
            Analyzer and Who to Start on the NFL player pool, or connect ESPN,
            without an account. UI labels you as Guest.
          </p>
        </div>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <p className="type-caption text-center text-emerald-950/50">
          Already have an account?{" "}
          <PendingLink
            href="/login?mode=account"
            className="font-semibold text-emerald-900 underline-offset-2 hover:underline"
          >
            Sign in
          </PendingLink>
        </p>
      </div>
    );
  }

  if (formMode === "verify") {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-base font-semibold text-emerald-950">
            Check your email
          </h2>
          <p className="type-caption mt-1 leading-relaxed text-emerald-950/55">
            Enter the 6-digit code we sent to{" "}
            <span className="font-semibold text-emerald-900">{email}</span>. Your
            password account is not active until this step succeeds.
          </p>
        </div>

        <form onSubmit={handleVerify} className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1.5 block text-emerald-950/60">
              Verification code
            </span>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              autoComplete="one-time-code"
              className="field-input tracking-[0.3em]"
              placeholder="000000"
            />
          </label>
          <Button
            type="submit"
            variant="secondary"
            size="lg"
            className="w-full"
            disabled={pending || code.length !== 6}
            loading={pending}
          >
            {pending ? "Verifying…" : "Verify & sign in"}
          </Button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2 type-caption">
          <button
            type="button"
            className="font-semibold text-emerald-900 underline-offset-2 hover:underline disabled:opacity-50"
            disabled={pending}
            onClick={handleResend}
          >
            Resend code
          </button>
          <button
            type="button"
            className="text-emerald-950/50 underline-offset-2 hover:underline"
            disabled={pending}
            onClick={() => {
              setFormMode("register");
              setCode("");
              setInfo(null);
              setError(null);
            }}
          >
            Back
          </button>
        </div>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
        {info && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {info}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {(googleEnabled || githubEnabled) && (
        <div className="space-y-2">
          {googleEnabled && (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="w-full"
              disabled={pending}
              loading={pending}
              onClick={() => handleOAuth("google")}
            >
              Continue with Google
            </Button>
          )}
          {githubEnabled && (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="w-full"
              disabled={pending}
              loading={pending}
              onClick={() => handleOAuth("github")}
            >
              Continue with GitHub
            </Button>
          )}
        </div>
      )}

      {!googleEnabled && !githubEnabled && (
        <p className="rounded-xl border border-dashed border-emerald-950/15 bg-[color-mix(in_srgb,var(--kraft)_40%,var(--surface))] px-3 py-2 text-xs leading-relaxed text-emerald-950/55">
          Google and GitHub OAuth are optional. Set{" "}
          <code className="text-emerald-900">AUTH_GOOGLE_*</code> /{" "}
          <code className="text-emerald-900">AUTH_GITHUB_*</code> (or{" "}
          <code className="text-emerald-900">GOOGLE_CLIENT_*</code> /{" "}
          <code className="text-emerald-900">GITHUB_ID</code> +{" "}
          <code className="text-emerald-900">GITHUB_SECRET</code>) on Vercel to
          enable them. Email/password works without those keys.
        </p>
      )}

      <div className="relative py-1 text-center type-caption text-emerald-950/40">
        <span className="relative z-10 bg-[var(--surface)] px-2">Email</span>
        <span className="absolute inset-x-0 top-1/2 h-px bg-emerald-950/10" />
      </div>

      <div className="flex gap-2 text-sm font-semibold">
        <button
          type="button"
          onClick={() => {
            setFormMode("signin");
            setError(null);
            setInfo(null);
          }}
          className={cn(
            "rounded-lg px-2 py-1 transition-colors",
            formMode === "signin"
              ? "bg-orange-50 text-orange-700"
              : "text-emerald-950/40 hover:text-emerald-950/70",
          )}
        >
          Sign in
        </button>
        <span className="self-center text-emerald-950/20">·</span>
        <button
          type="button"
          onClick={() => {
            setFormMode("register");
            setError(null);
            setInfo(null);
          }}
          className={cn(
            "rounded-lg px-2 py-1 transition-colors",
            formMode === "register"
              ? "bg-orange-50 text-orange-700"
              : "text-emerald-950/40 hover:text-emerald-950/70",
          )}
        >
          Create account
        </button>
      </div>

      <form onSubmit={handleCredentials} className="space-y-3">
        {formMode === "register" && (
          <label className="block text-sm">
            <span className="mb-1.5 block text-emerald-950/60">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className="field-input"
            />
          </label>
        )}
        <label className="block text-sm">
          <span className="mb-1.5 block text-emerald-950/60">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="field-input"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-emerald-950/60">Password</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={formMode === "register" ? "new-password" : "current-password"}
            className="field-input"
          />
          {formMode === "register" && (
            <span className="type-caption mt-1.5 block text-emerald-950/45">
              At least 8 characters. We email a code before the account is active.
            </span>
          )}
        </label>
        <Button
          type="submit"
          variant="secondary"
          size="lg"
          className="w-full"
          disabled={pending}
          loading={pending}
        >
          {pending
            ? "Working…"
            : formMode === "register"
              ? "Create account"
              : "Sign in with email"}
        </Button>
      </form>

      {formMode === "signin" && (
        <p className="type-caption text-center text-emerald-950/50">
          Have a code waiting?{" "}
          <button
            type="button"
            className="font-semibold text-emerald-900 underline-offset-2 hover:underline"
            onClick={() => {
              setFormMode("verify");
              setError(null);
              setInfo("Enter the code from your email (resend if it expired).");
            }}
          >
            Enter verification code
          </button>
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {info && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {info}
        </p>
      )}

      <p className="type-caption text-center text-emerald-950/50">
        Just browsing?{" "}
        <PendingLink
          href="/login?mode=guest"
          className="font-semibold text-emerald-900 underline-offset-2 hover:underline"
        >
          Try as Guest
        </PendingLink>
      </p>
    </div>
  );
}
