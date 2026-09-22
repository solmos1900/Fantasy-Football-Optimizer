"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Mode = "signin" | "register";

export function LoginActions({
  googleEnabled,
  githubEnabled,
}: {
  googleEnabled: boolean;
  githubEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function goDashboard() {
    // Avoid Auth.js client redirect races that briefly hit a broken route / 404.
    router.replace("/dashboard");
    router.refresh();
  }

  function handleGuest() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await signIn("guest", {
        name: name.trim() || "Guest",
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
      if (mode === "register") {
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
          mode === "register"
            ? "Account created but sign-in failed. Try signing in."
            : "Invalid email or password.",
        );
        if (mode === "register") setMode("signin");
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
          enable them. Email/password and Guest work without those keys.
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
            setMode("signin");
            setError(null);
            setInfo(null);
          }}
          className={cn(
            "rounded-lg px-2 py-1 transition-colors",
            mode === "signin"
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
            setMode("register");
            setError(null);
            setInfo(null);
          }}
          className={cn(
            "rounded-lg px-2 py-1 transition-colors",
            mode === "register"
              ? "bg-orange-50 text-orange-700"
              : "text-emerald-950/40 hover:text-emerald-950/70",
          )}
        >
          Create account
        </button>
      </div>

      <form onSubmit={handleCredentials} className="space-y-3">
        {mode === "register" && (
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
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            className="field-input"
          />
          {mode === "register" && (
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
            : mode === "register"
              ? "Create account & sign in"
              : "Sign in with email"}
        </Button>
      </form>

      <div className="relative py-1 text-center type-caption text-emerald-950/40">
        <span className="relative z-10 bg-[var(--surface)] px-2">Or try first</span>
        <span className="absolute inset-x-0 top-1/2 h-px bg-emerald-950/10" />
      </div>

      <div className="space-y-2">
        <label className="block text-sm">
          <span className="mb-1.5 block text-emerald-950/60">Guest display name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Guest"
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
          Continue as Guest
        </Button>
        <p className="type-caption leading-relaxed text-emerald-950/50">
          Guest mode creates a temporary session so you can connect ESPN or load
          the demo league without OAuth.
        </p>
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
