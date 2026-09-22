"use client";

import { signIn } from "next-auth/react";
import { useState, useTransition } from "react";

export function LoginActions({
  googleEnabled,
  githubEnabled,
}: {
  googleEnabled: boolean;
  githubEnabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("Sebastian");

  return (
    <div className="space-y-4">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(() =>
            signIn("demo", {
              email: "sebastian@demo.local",
              name,
              callbackUrl: "/dashboard",
            }),
          )
        }
        className="flex w-full items-center justify-center rounded-md bg-orange-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-orange-500 disabled:opacity-60"
      >
        Continue with Demo
      </button>

      <label className="block text-sm">
        <span className="mb-1 block text-emerald-950/60">Demo display name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-emerald-950/15 bg-white px-3 py-2 text-sm outline-none ring-orange-500/30 focus:ring-2"
        />
      </label>

      {(googleEnabled || githubEnabled) && (
        <div className="relative py-2 text-center text-xs uppercase tracking-wider text-emerald-950/40">
          <span className="relative z-10 bg-[#E8EFEA] px-2">or SSO</span>
          <span className="absolute inset-x-0 top-1/2 h-px bg-emerald-950/10" />
        </div>
      )}

      {googleEnabled && (
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => signIn("google", { callbackUrl: "/dashboard" }))}
          className="flex w-full items-center justify-center rounded-md border border-emerald-950/15 bg-white px-4 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50 disabled:opacity-60"
        >
          Continue with Google
        </button>
      )}

      {githubEnabled && (
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => signIn("github", { callbackUrl: "/dashboard" }))}
          className="flex w-full items-center justify-center rounded-md border border-emerald-950/15 bg-white px-4 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50 disabled:opacity-60"
        >
          Continue with GitHub
        </button>
      )}

      {!googleEnabled && !githubEnabled && (
        <p className="text-center text-xs leading-relaxed text-emerald-950/50">
          Add <code className="text-emerald-900">AUTH_GOOGLE_*</code> or{" "}
          <code className="text-emerald-900">AUTH_GITHUB_*</code> in{" "}
          <code className="text-emerald-900">.env</code> to enable SSO. Demo login
          works without keys.
        </p>
      )}
    </div>
  );
}
