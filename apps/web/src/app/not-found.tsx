import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sidan finns inte",
};

/**
 * Without this file Next.js serves its own English "This page could not be
 * found", which is what a mistyped or stale URL produced in an otherwise
 * Swedish product. It also offered nothing to do next.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-[18px] bg-surface-elevated p-6 shadow-[var(--ffos-shadow-soft)]">
        <p className="text-sm text-text-muted">Sidan finns inte</p>
        <h1 className="mt-2 font-[family-name:var(--ffos-font-display)] text-2xl tracking-tight text-text-primary">
          Vi hittade inte sidan du sökte
        </h1>
        <p className="mt-3 text-sm text-text-secondary">
          Adressen kan ha ändrats, eller så pekar en gammal länk hit. Din
          ekonomi är oförändrad.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link
            href="/"
            className="flex min-h-11 items-center justify-center rounded-[12px] bg-accent px-4 text-sm font-medium text-on-accent"
          >
            Till översikten
          </Link>
          <Link
            href="/transactions"
            className="flex min-h-11 items-center justify-center rounded-[12px] border border-border-strong px-4 text-sm text-text-primary"
          >
            Till transaktioner
          </Link>
        </div>
      </div>
    </main>
  );
}
