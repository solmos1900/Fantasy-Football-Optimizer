"use client";

import { signOut } from "next-auth/react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

const CONFIRM_WORD = "DELETE";

export function DeleteAccountPanel({ isGuest }: { isGuest: boolean }) {
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ready = confirm.trim().toUpperCase() === CONFIRM_WORD;

  function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not delete your account. Please try again.");
        return;
      }
      await signOut({ callbackUrl: "/?deleted=1" });
    });
  }

  return (
    <form
      onSubmit={handleDelete}
      className="space-y-3 rounded-xl border border-red-300/40 bg-red-500/5 p-4"
    >
      <h2 className="text-base font-semibold text-emerald-950">
        Delete {isGuest ? "guest session" : "account"}
      </h2>
      <p className="type-body text-sm text-emerald-950/65">
        This permanently removes your {isGuest ? "guest session" : "account"},
        connected leagues (including saved ESPN cookies), and saved chats. It
        cannot be undone.
      </p>
      <label className="block text-sm">
        <span className="mb-1.5 block text-emerald-950/60">
          Type <span className="font-semibold">{CONFIRM_WORD}</span> to confirm
        </span>
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="off"
          className="field-input"
        />
      </label>
      <Button
        type="submit"
        variant="danger"
        size="lg"
        className="w-full"
        disabled={!ready || pending}
        loading={pending}
      >
        {pending ? "Deleting…" : "Delete permanently"}
      </Button>
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </form>
  );
}
