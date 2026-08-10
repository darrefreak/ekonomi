"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DEMO_CREDENTIALS,
  loginWithCredentials,
  loginWithDemo,
  registerWithCredentials,
} from "@/lib/session";
import { describeError } from "@/lib/error-message";

/**
 * Whether this build offers the shared demo account.
 *
 * The form used to arrive with `demo@ffos.local` and its password already typed
 * in, and printed both under the form. In a deployment holding a real
 * household's finances that is somebody else's credentials on the sign-in
 * screen, and a pre-filled password field also stops a password manager from
 * doing its job. Demo affordances are now opt-in per build, and off unless a
 * deployment asks for them.
 */
const SHOW_DEMO = process.env.NEXT_PUBLIC_FFOS_SHOW_DEMO === "true";

/**
 * Sign-in failures in the participant's language.
 *
 * The API answers a bad password with `Invalid credentials`, and that English
 * string was rendered verbatim inside an otherwise Swedish product. A person
 * mistyping a password should not be told anything about the backend.
 */
function signInMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "";
  // Registering with a taken address deserves more precise wording than the
  // shared mapping's generic "there is already a record with those details".
  if (/already exists|conflict|409/i.test(raw)) {
    return "Det finns redan ett konto med den e-postadressen.";
  }
  if (/invalid credentials|unauthorized|401/i.test(raw)) {
    return "Fel e-post eller lösenord. Försök igen.";
  }
  return describeError(error, "Inloggningen misslyckades. Försök igen.");
}

/**
 * Where to go after signing in.
 *
 * Only in-product paths are accepted, so a crafted `?next=` cannot bounce
 * somebody to another site straight after they authenticate.
 */
function safeReturnPath(next: string | null): string {
  if (!next) return "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  if (next.startsWith("/login")) return "/";
  return next;
}

export function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeReturnPath(searchParams.get("next"));
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(action: () => Promise<string | "onboarding">) {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await action();
      if (result === "onboarding") {
        router.replace("/onboarding");
      } else {
        router.replace(returnTo);
      }
      router.refresh();
    } catch (err) {
      // The email stays; only the password is cleared, so a retry is one field.
      setPassword("");
      setError(signInMessage(err));
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
              name="name"
              autoComplete="name"
              required
              placeholder="Ditt namn"
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
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
            placeholder="namn@exempel.se"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-text-primary"
          />
        </label>

        <label className="block space-y-1.5 text-sm">
          <span className="text-text-secondary">Lösenord</span>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-11 w-full rounded-[12px] border border-border bg-surface pl-3 pr-24 text-text-primary"
            />
            <button
              type="button"
              onClick={() => setShowPassword((shown) => !shown)}
              aria-pressed={showPassword}
              className="absolute right-1 top-1/2 min-h-11 -translate-y-1/2 rounded-[10px] px-3 text-sm text-accent"
            >
              {showPassword ? "Dölj" : "Visa"}
            </button>
          </div>
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

        {mode === "login" && SHOW_DEMO ? (
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

      {SHOW_DEMO ? (
        <p className="mt-4 text-xs text-text-muted">
          Demo: {DEMO_CREDENTIALS.email} / {DEMO_CREDENTIALS.password}
        </p>
      ) : null}
    </div>
  );
}
