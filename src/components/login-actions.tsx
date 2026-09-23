"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { scrollToTopNow } from "@/components/scroll-to-top";

type FormMode = "signin" | "register";
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
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Registration failed.");
          return;
        }
      }

      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(
          formMode === "register"
            ? "Account created but sign-in failed. Try signing in."
            : "Invalid email or password.",
        );
        if (formMode === "register") setFormMode("signin");
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
            Guest mode creates a temporary session so you can connect ESPN or
            load the demo league without an account. UI labels you as Guest.
          </p>
        </div>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <p className="type-caption text-center text-emerald-950/50">
          Already have an account?{" "}
          <Link
            href="/login?mode=account"
            className="font-semibold text-emerald-900 underline-offset-2 hover:underline"
          >
            Sign in
          </Link>
        </p>
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
        <p className="rounded-xl border border-dashed border-emerald-950/15 bg-white/50 px-3 py-2 text-xs leading-relaxed text-emerald-950/55">
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
              At least 8 characters. Stored as a bcrypt hash.
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
              ? "Create account & sign in"
              : "Sign in with email"}
        </Button>
      </form>

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
        <Link
          href="/login?mode=guest"
          className="font-semibold text-emerald-900 underline-offset-2 hover:underline"
        >
          Try as Guest
        </Link>
      </p>
    </div>
  );
}
