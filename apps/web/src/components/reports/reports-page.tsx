"use client";

import { useCallback, useEffect, useState } from "react";
import type { MonthlyReport, YearlyReport } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function ReportsPage() {
  const [monthly, setMonthly] = useState<MonthlyReport | null>(null);
  const [yearly, setYearly] = useState<YearlyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("2026-07");

  const load = useCallback(async (p: string) => {
    const id = await ensureHouseholdSession();
    const [m, y] = await Promise.all([
      api.getMonthlyReport(id, p),
      api.getYearlyReport(id, Number(p.slice(0, 4))),
    ]);
    setMonthly(m);
    setYearly(y);
  }, []);

  useEffect(() => {
    void load(period)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [load, period]);

  if (loading) return <LoadingState label="Hämtar rapporter…" />;
  if (error || !monthly || !yearly) {
    return <ErrorState title="Kunde inte hämta rapporter" description={error ?? ""} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
            Rapporter
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Månads- och årsöversikt · as of {monthly.asOf}
          </p>
        </div>
        <label className="text-sm text-text-secondary">
          Period
          <input
            type="month"
            className="mt-1 block min-h-11 rounded-[12px] border border-border bg-surface px-3"
            value={period}
            onChange={(e) => {
              setLoading(true);
              setPeriod(e.target.value);
            }}
          />
        </label>
      </div>

      <section className="rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm text-text-secondary">Månad {monthly.period}</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <Stat label="Inkomst" value={<MoneyValue value={monthly.income} />} />
          <Stat label="Utgifter" value={<MoneyValue value={monthly.spending} />} />
          <Stat label="Sparande" value={<MoneyValue value={monthly.savings} signed />} />
          <Stat
            label="Sparkvot"
            value={`${monthly.savingsRatePercent.toFixed(1)} %`}
          />
        </dl>
        {monthly.topCategories.length > 0 ? (
          <ul className="mt-5 space-y-2 text-sm">
            {monthly.topCategories.map((c) => (
              <li key={c.categoryKey} className="flex justify-between gap-3">
                <span className="text-text-secondary">{c.categoryName}</span>
                <MoneyValue value={c.spending} />
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm text-text-secondary">År {yearly.year}</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <Stat label="Inkomst" value={<MoneyValue value={yearly.income} />} />
          <Stat label="Utgifter" value={<MoneyValue value={yearly.spending} />} />
          <Stat label="Sparande" value={<MoneyValue value={yearly.savings} signed />} />
          <Stat
            label="Sparkvot"
            value={`${yearly.savingsRatePercent.toFixed(1)} %`}
          />
        </dl>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="mt-1 text-lg font-medium tabular-nums">{value}</dd>
    </div>
  );
}
