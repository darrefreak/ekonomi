"use client";

import { useEffect, useState } from "react";
import type { ForecastResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function ForecastPage() {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ensureHouseholdSession()
      .then((id) => api.getForecast(id))
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label="Hämtar forecast…" />;
  if (error || !data) {
    return <ErrorState title="Kunde inte hämta forecast" description={error ?? ""} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Forecast
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Deterministisk projektion · as of {data.asOf}
        </p>
      </div>
      <section className="overflow-hidden rounded-[16px] bg-surface-elevated">
        <ul className="divide-y divide-border">
          {data.points.map((p) => (
            <li key={p.label} className="flex justify-between gap-3 px-5 py-4 text-sm">
              <div>
                <p className="font-medium">{p.label}</p>
                <p className="text-xs text-text-muted">{p.onDate}</p>
              </div>
              <div className="text-right">
                <MoneyValue value={p.projectedCash} />
                <p className="mt-1 text-xs text-text-secondary">kassa</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="overflow-hidden rounded-[16px] bg-surface-elevated">
        <h2 className="border-b border-border px-5 py-3 text-sm text-text-secondary">
          Savings optimizer
        </h2>
        <ul className="divide-y divide-border">
          {data.optimizer.map((o) => (
            <li key={o.id} className="flex justify-between gap-3 px-5 py-4 text-sm">
              <div>
                <p className="font-medium">{o.title}</p>
                <p className="text-xs text-text-muted">effort {o.effort}</p>
              </div>
              <MoneyValue value={o.estimatedAnnualSaving} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
