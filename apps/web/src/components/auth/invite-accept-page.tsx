"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, setSession } from "@/lib/api";
import { hasSession, setHouseholdAfterCreate } from "@/lib/session";

export function InviteAcceptPage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token")?.trim() ?? "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ householdId: string; role: string } | null>(
    null,
  );

  async function ensureAuthed() {
    if (hasSession()) return;
    if (!email.trim() || !password) {
      throw new Error("Logga in med e-post och lösenord för att acceptera.");
    }
    const loggedIn = await api.login({
      email: email.trim(),
      password,
    });
    setSession(loggedIn.tokens);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!token) {
        throw new Error("Inbjudningslänken saknar token.");
      }
      await ensureAuthed();
      const result = await api.acceptInvite({ token });
      setHouseholdAfterCreate(result.householdId);
      setDone({ householdId: result.householdId, role: result.role });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Kunde inte acceptera inbjudan.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Inbjudan accepterad
        </h1>
        <p className="mt-3 text-sm text-text-secondary">
          Du är nu medlem ({done.role}) i hushållet.
        </p>
        <button
          type="button"
          className="mt-6 min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-on-accent"
          onClick={() => router.replace("/")}
        >
          Gå till översikten
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
        Acceptera inbjudan
      </h1>
      <p className="mt-2 text-sm text-text-secondary">
        Logga in med kontot som matchar inbjudan för att gå med i hushållet.
      </p>

      {!token ? (
        <p className="mt-4 text-sm text-negative" role="alert">
          Ogiltig länk — saknar token.
        </p>
      ) : null}

      <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-3">
        {!hasSession() ? (
          <>
            <label className="block text-sm">
              <span className="text-text-muted">E-post</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="text-text-muted">Lösenord</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm"
              />
            </label>
          </>
        ) : (
          <p className="text-sm text-text-secondary">
            Du är inloggad. Klicka för att acceptera inbjudan.
          </p>
        )}

        {error ? (
          <p className="text-sm text-negative" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy || !token}
          className="min-h-11 w-full rounded-[12px] bg-accent px-4 text-sm font-medium text-on-accent disabled:opacity-60"
        >
          {busy ? "Accepterar…" : "Acceptera inbjudan"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-text-muted">
        <Link href="/login" className="underline">
          Till inloggning
        </Link>
      </p>
    </div>
  );
}
