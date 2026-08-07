"use client";

import { useEffect, useState } from "react";
import type { SubscriptionsResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function SubscriptionsPage() {
  const [data, setData] = useState<SubscriptionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ensureHouseholdSession()
      .then((id) => api.getSubscriptions(id))
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label="Hämtar abonnemang…" />;
  if (error || !data) {
    return (
      <ErrorState
        title="Kunde inte hämta abonnemang"
        description={error ?? "Ingen data"}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Abonnemang
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Återkommande kostnader och upptäckta mönster · as of {data.asOf}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-[16px] bg-surface-elevated p-5">
          <p className="text-sm text-text-secondary">Per månad</p>
          <div className="mt-2 text-xl">
            <MoneyValue value={data.totalMonthly} />
          </div>
        </section>
        <section className="rounded-[16px] bg-surface-elevated p-5">
          <p className="text-sm text-text-secondary">Per år</p>
          <div className="mt-2 text-xl">
            <MoneyValue value={data.totalAnnual} />
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-[16px] bg-surface-elevated">
        <h2 className="border-b border-border px-5 py-3 text-sm text-text-secondary">
          Aktiva abonnemang
        </h2>
        <ul className="divide-y divide-border">
          {data.items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 px-5 py-4">
              <div>
                <p className="font-medium">{item.name}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {item.cadence.toLowerCase()}
                  {item.priceTrendPercent
                    ? ` · pris ${item.priceTrendPercent > 0 ? "+" : ""}${item.priceTrendPercent}%`
                    : ""}
                  {item.nextChargeOn ? ` · nästa ${item.nextChargeOn}` : ""}
                </p>
              </div>
              <div className="text-right text-sm">
                <MoneyValue value={item.amount} />
                <p className="mt-1 text-xs text-text-secondary">
                  <MoneyValue value={item.annualCost} /> / år
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="overflow-hidden rounded-[16px] bg-surface-elevated">
        <h2 className="border-b border-border px-5 py-3 text-sm text-text-secondary">
          Återkommande mönster
        </h2>
        <ul className="divide-y divide-border">
          {data.recurring.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 px-5 py-4">
              <div>
                <p className="font-medium">{item.name}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {item.status.toLowerCase()} · {item.kind}
                  {item.nextExpectedOn ? ` · väntas ${item.nextExpectedOn}` : ""}
                </p>
              </div>
              <MoneyValue value={item.amount} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
