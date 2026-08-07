"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  DEMO_CREDENTIALS,
  loginWithCredentials,
  loginWithDemo,
  registerWithCredentials,
} from "@/lib/session";

export function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState<string>(DEMO_CREDENTIALS.email);
  const [password, setPassword] = useState<string>(DEMO_CREDENTIALS.password);
  const [displayName, setDisplayName] = useState("Ny användare");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(action: () => Promise<string | "onboarding">) {
    setLoading(true);
    setError(null);
    try {
      const result = await action();
      if (result === "onboarding") {
        router.replace("/onboarding");
      } else {
        router.replace("/");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inloggningen misslyckades");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (mode === "register") {
      void submit(() =>
        registerWithCredentials(email.trim(), password, displayName.trim()),
      );
      return;
    }
    void submit(() => loginWithCredentials(email.trim(), password));
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-8">
        <p className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight text-text-primary">
          Family Financial OS
        </p>
        <p className="mt-2 text-sm text-text-secondary">
          {mode === "login"
            ? "Logga in för att se hushållets ekonomi."
            : "Skapa konto och gå vidare till onboarding."}
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-[18px] bg-surface-elevated p-5 shadow-[var(--ffos-shadow-soft)]"
      >
        {mode === "register" ? (
          <label className="block space-y-1.5 text-sm">
            <span className="text-text-secondary">Namn</span>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-text-primary"
            />
          </label>
        ) : null}

        <label className="block space-y-1.5 text-sm">
          <span className="text-text-secondary">E-post</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-text-primary"
          />
        </label>

        <label className="block space-y-1.5 text-sm">
          <span className="text-text-secondary">Lösenord</span>
          <input
            type="password"
            name="password"
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-text-primary"
          />
        </label>

        {error ? (
          <p className="text-sm text-negative" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="min-h-11 w-full rounded-[12px] bg-accent px-4 text-sm font-medium text-white disabled:opacity-60"
        >
          {loading
            ? "Vänta…"
            : mode === "login"
              ? "Logga in"
              : "Skapa konto"}
        </button>

        {mode === "login" ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => void submit(() => loginWithDemo())}
            className="min-h-11 w-full rounded-[12px] border border-border-strong px-4 text-sm disabled:opacity-60"
          >
            Använd demo-konto
          </button>
        ) : null}

        <button
          type="button"
          className="w-full text-sm text-accent"
          onClick={() =>
            setMode((m) => (m === "login" ? "register" : "login"))
          }
        >
          {mode === "login"
            ? "Skapa nytt konto →"
            : "Har redan konto? Logga in →"}
        </button>
      </form>

      <p className="mt-4 text-xs text-text-muted">
        Demo: {DEMO_CREDENTIALS.email} / {DEMO_CREDENTIALS.password}
      </p>
    </div>
  );
}
