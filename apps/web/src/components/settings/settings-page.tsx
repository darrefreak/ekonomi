"use client";

import { useRouter } from "next/navigation";
import { DEMO_CREDENTIALS, logout } from "@/lib/session";

export function SettingsPage() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Inställningar
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Demo-miljö och hushållspolicies (V1)
        </p>
      </div>

      <section className="rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm text-text-secondary">Demo-inloggning</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-text-secondary">E-post</dt>
            <dd className="font-mono text-xs">{DEMO_CREDENTIALS.email}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-text-secondary">Lösenord</dt>
            <dd className="font-mono text-xs">{DEMO_CREDENTIALS.password}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-text-secondary">As of</dt>
            <dd>2026-08-01</dd>
          </div>
        </dl>
        <button
          type="button"
          className="mt-4 min-h-11 rounded-[12px] border border-border-strong px-4 text-sm"
          onClick={() => {
            logout();
            router.replace("/login");
          }}
        >
          Logga ut
        </button>
      </section>

      <section className="rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm text-text-secondary">Principer</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-text-secondary">
          <li>Siffror kommer från `@ffos/financial-engine` — aldrig från AI-gissning.</li>
          <li>Pengar lagras som minor units (bigint), API som string.</li>
          <li>Alla endpoints är household-scoped.</li>
          <li>Inga riktiga bank-/OCR-/BankID-integrationer i V1.</li>
        </ul>
      </section>

      <section className="rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm text-text-secondary">Tillgänglighet</h2>
        <p className="mt-3 text-sm text-text-secondary">
          Skip-länk till huvudinnehåll, synlig fokusokus, svenska (`lang=sv`), och
          responsiv mobilnavigation med safe-area.
        </p>
      </section>
    </div>
  );
}
