"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { CashflowResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MiniCashflowChart } from "../financial/mini-cashflow-chart";
import { MoneyValue } from "../financial/money-value";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function CashflowPage() {
  const [data, setData] = useState<CashflowResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ensureHouseholdSession()
      .then((id) => api.getCashflow(id))
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label="Hämtar kassaflöde…" />;
  if (error || !data) {
    return (
      <ErrorState
        title="Kunde inte hämta kassaflöde"
        description={error ?? "Ingen data"}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Kassaflöde
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Inkomst, utgifter och sparande per månad · as of {data.asOf}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-[16px] bg-surface-elevated p-5">
          <h2 className="text-sm text-text-secondary">
            {data.currentPeriod.label}
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Row label="Inkomst" value={<MoneyValue value={data.currentPeriod.income} />} />
            <Row label="Utgifter" value={<MoneyValue value={data.currentPeriod.spending} />} />
            <Row label="Sparat" value={<MoneyValue value={data.currentPeriod.savings} />} />
          </dl>
        </section>
        <section className="rounded-[16px] bg-surface-elevated p-5">
          <h2 className="text-sm text-text-secondary">Jämfört med {data.previousPeriod.label}</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Row
              label="Utgiftsförändring"
              value={<MoneyValue value={data.comparison.spendingDelta} signed />}
            />
            <Row
              label="Inkomstförändring"
              value={<MoneyValue value={data.comparison.incomeDelta} signed />}
            />
            <Row
              label="Utgifter %"
              value={
                <span className="tabular-nums">
                  {data.comparison.spendingDeltaPercent.toFixed(1)} %
                </span>
              }
            />
          </dl>
        </section>
      </div>

      <section className="rounded-[16px] bg-surface-elevated p-5">
        <h2 className="mb-4 text-sm text-text-secondary">Senaste 12 månaderna</h2>
        <MiniCashflowChart points={data.points} />
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-text-secondary">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
