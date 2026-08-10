"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * The product had no error boundary, so an unexpected render error replaced the
 * page with the framework's own English screen — and in production with a blank
 * one.
 *
 * A person reading this needs three things: to know their money is untouched, a
 * way to try again, and a way out. The digest is Next.js's own reference for the
 * server-side log; it is not a stack trace and it is the only technical detail
 * worth surfacing, because it is what makes a report actionable.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-[18px] bg-surface-elevated p-6 shadow-[var(--ffos-shadow-soft)]">
        <p className="text-sm text-text-muted">Något gick fel</p>
        <h1 className="mt-2 font-[family-name:var(--ffos-font-display)] text-2xl tracking-tight text-text-primary">
          Sidan kunde inte visas
        </h1>
        <p className="mt-3 text-sm text-text-secondary">
          Felet gäller visningen, inte din bokföring. Inga belopp har ändrats.
          Försök igen — om det återkommer, gå till översikten.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="flex min-h-11 items-center justify-center rounded-[12px] bg-accent px-4 text-sm font-medium text-on-accent"
          >
            Försök igen
          </button>
          <Link
            href="/"
            className="flex min-h-11 items-center justify-center rounded-[12px] border border-border-strong px-4 text-sm text-text-primary"
          >
            Till översikten
          </Link>
        </div>
        {error.digest ? (
          <p className="mt-4 text-xs text-text-muted">
            Referens för felsökning: {error.digest}
          </p>
        ) : null}
      </div>
    </main>
  );
}
