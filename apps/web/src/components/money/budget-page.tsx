"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { BudgetResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function BudgetPage() {
  const [data, setData] = useState<BudgetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ensureHouseholdSession()
      .then((id) => api.getBudget(id))
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label="Hämtar budget…" />;
  if (error || !data) {
    return (
      <ErrorState title="Kunde inte hämta budget" description={error ?? "Ingen data"} />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Budget
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Planerat vs faktiskt · {data.period.label} · as of {data.asOf}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Planerat" value={<MoneyValue value={data.totals.planned} />} />
        <Stat label="Faktiskt" value={<MoneyValue value={data.totals.actual} />} />
        <Stat label="Kvar" value={<MoneyValue value={data.totals.remaining} signed />} />
        <Stat
          label="Utnyttjande"
          value={
            <span className="tabular-nums">
              {data.totals.utilizationPercent.toFixed(0)} %
            </span>
          }
        />
      </div>

      <section className="overflow-hidden rounded-[16px] bg-surface-elevated">
        <ul className="divide-y divide-border">
          {data.lines.map((line) => (
            <li key={line.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-text-primary">{line.name}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {line.utilizationPercent.toFixed(0)} % av budget
                  </p>
                </div>
                <div className="text-right text-sm">
                  <MoneyValue value={line.actual} />
                  <p className="mt-1 text-xs text-text-secondary">
                    av <MoneyValue value={line.planned} />
                  </p>
                </div>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full bg-accent"
                  style={{
                    width: `${Math.min(100, Math.max(0, line.utilizationPercent))}%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <section className="rounded-[16px] bg-surface-elevated p-5">
      <p className="text-sm text-text-secondary">{label}</p>
      <div className="mt-2 text-lg">{value}</div>
    </section>
  );
}
