"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

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
            <button
              type="button"
              disabled={pending}
              onClick={() => handleOAuth("google")}
              className="flex w-full items-center justify-center rounded-md border border-emerald-950/15 bg-white px-4 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50 disabled:opacity-60"
            >
              Continue with Google
            </button>
          )}
          {githubEnabled && (
            <button
              type="button"
              disabled={pending}
              onClick={() => handleOAuth("github")}
              className="flex w-full items-center justify-center rounded-md border border-emerald-950/15 bg-white px-4 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50 disabled:opacity-60"
            >
              Continue with GitHub
            </button>
          )}
        </div>
      )}

      {!googleEnabled && !githubEnabled && (
        <p className="rounded-md border border-dashed border-emerald-950/15 bg-white/50 px-3 py-2 text-xs leading-relaxed text-emerald-950/55">
          Google and GitHub OAuth are optional. Set{" "}
          <code className="text-emerald-900">AUTH_GOOGLE_*</code> /{" "}
          <code className="text-emerald-900">AUTH_GITHUB_*</code> (or{" "}
          <code className="text-emerald-900">GOOGLE_CLIENT_*</code> /{" "}
          <code className="text-emerald-900">GITHUB_ID</code> +{" "}
          <code className="text-emerald-900">GITHUB_SECRET</code>) on Vercel to
          enable them. Email/password and Guest work without those keys.
        </p>
      )}

      <div className="relative py-1 text-center text-xs uppercase tracking-wider text-emerald-950/40">
        <span className="relative z-10 bg-[#F4F7F5] px-2">Email</span>
        <span className="absolute inset-x-0 top-1/2 h-px bg-emerald-950/10" />
      </div>

      <div className="flex gap-2 text-xs font-semibold uppercase tracking-wider">
        <button
          type="button"
          onClick={() => {
            setMode("signin");
            setError(null);
            setInfo(null);
          }}
          className={
            mode === "signin"
              ? "text-orange-700"
              : "text-emerald-950/40 hover:text-emerald-950/70"
          }
        >
          Sign in
        </button>
        <span className="text-emerald-950/20">·</span>
        <button
          type="button"
          onClick={() => {
            setMode("register");
            setError(null);
            setInfo(null);
          }}
          className={
            mode === "register"
              ? "text-orange-700"
              : "text-emerald-950/40 hover:text-emerald-950/70"
          }
        >
          Create account
        </button>
      </div>

      <form onSubmit={handleCredentials} className="space-y-3">
        {mode === "register" && (
          <label className="block text-sm">
            <span className="mb-1 block text-emerald-950/60">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className="w-full rounded-md border border-emerald-950/15 bg-white px-3 py-2 text-sm outline-none ring-orange-500/30 focus:ring-2"
            />
          </label>
        )}
        <label className="block text-sm">
          <span className="mb-1 block text-emerald-950/60">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="w-full rounded-md border border-emerald-950/15 bg-white px-3 py-2 text-sm outline-none ring-orange-500/30 focus:ring-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-emerald-950/60">Password</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            className="w-full rounded-md border border-emerald-950/15 bg-white px-3 py-2 text-sm outline-none ring-orange-500/30 focus:ring-2"
          />
          {mode === "register" && (
            <span className="mt-1 block text-xs text-emerald-950/45">
              At least 8 characters. Stored as a bcrypt hash.
            </span>
          )}
        </label>
        <button
          type="submit"
          disabled={pending}
          className="flex w-full items-center justify-center rounded-md bg-emerald-950 px-4 py-3 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-900 disabled:opacity-60"
        >
          {pending
            ? "Working…"
            : mode === "register"
              ? "Create account & sign in"
              : "Sign in with email"}
        </button>
      </form>

      <div className="relative py-1 text-center text-xs uppercase tracking-wider text-emerald-950/40">
        <span className="relative z-10 bg-[#F4F7F5] px-2">Or try first</span>
        <span className="absolute inset-x-0 top-1/2 h-px bg-emerald-950/10" />
      </div>

      <div className="space-y-2">
        <label className="block text-sm">
          <span className="mb-1 block text-emerald-950/60">Guest display name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Guest"
            className="w-full rounded-md border border-emerald-950/15 bg-white px-3 py-2 text-sm outline-none ring-orange-500/30 focus:ring-2"
          />
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={handleGuest}
          className="flex w-full items-center justify-center rounded-md bg-orange-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-orange-500 disabled:opacity-60"
        >
          Continue as Guest
        </button>
        <p className="text-xs leading-relaxed text-emerald-950/50">
          Guest mode creates a temporary session so you can connect ESPN or load
          the demo-seeded league without OAuth. UI labels you as Guest.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {info && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {info}
        </p>
      )}
    </div>
  );
}
