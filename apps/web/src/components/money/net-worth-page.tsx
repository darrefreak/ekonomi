"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { NetWorthResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function NetWorthPage() {
  const [data, setData] = useState<NetWorthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ensureHouseholdSession()
      .then((id) => api.getNetWorth(id))
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label="Hämtar nettoförmögenhet…" />;
  if (error || !data) {
    return (
      <ErrorState
        title="Kunde inte hämta nettoförmögenhet"
        description={error ?? "Ingen data"}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Nettoförmögenhet
        </h1>
        <p className="mt-2 text-3xl font-medium">
          <MoneyValue value={data.current} />
        </p>
        <p className="mt-2 text-sm text-positive">
          <MoneyValue value={data.changeMonth} signed /> den här månaden
        </p>
      </div>

      <section className="grid gap-3 rounded-[16px] bg-surface-elevated p-5 md:grid-cols-2">
        <Stat label="Likvida medel" value={<MoneyValue value={data.breakdown.cash} />} />
        <Stat label="Investeringar" value={<MoneyValue value={data.breakdown.investments} />} />
        <Stat label="Tillgångar" value={<MoneyValue value={data.breakdown.assets} />} />
        <Stat label="Skulder" value={<MoneyValue value={data.breakdown.liabilities} />} />
      </section>

      <section className="rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm text-text-secondary">Vad drev förändringen?</h2>
        <ul className="mt-4 space-y-3">
          {data.attribution.map((item) => (
            <li key={item.key} className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">{item.label}</span>
              <MoneyValue value={item.amount} signed />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-1 text-lg font-medium">{value}</p>
    </div>
  );
}
