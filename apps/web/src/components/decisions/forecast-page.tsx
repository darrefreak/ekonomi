"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { ForecastBacktestResponse, ForecastResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { describeError } from "@/lib/error-message";

export function ForecastPage() {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [backtest, setBacktest] = useState<ForecastBacktestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [backtestBusy, setBacktestBusy] = useState(false);
  const [backtestError, setBacktestError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const id = await ensureHouseholdSession();
      setHouseholdId(id);
      setData(await api.getForecast(id));
    } catch (err) {
      setError(describeError(err, "Något gick fel"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runBacktest() {
    if (!householdId) return;
    setBacktestBusy(true);
    setBacktestError(null);
    try {
      setBacktest(await api.getForecastBacktest(householdId));
    } catch (err) {
      setBacktestError(describeError(err, "Backtest misslyckades"));
    } finally {
      setBacktestBusy(false);
    }
  }

  if (loading) return <LoadingState label="Hämtar forecast…" />;
  if (error) {
    return (
      <ErrorState
        title="Kunde inte hämta forecast"
        description={error}
        onRetry={() => void load()}
      />
    );
  }
  if (!data) {
    return (
      <EmptyState
        title="Ingen forecast"
        description="Lägg till konton och kassaflöde för att projicera 7d–12m."
        actionLabel="Försök igen"
        onAction={() => void load()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Forecast
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Deterministisk live-projektion (7d–12m) · {data.source} · as of{" "}
          {data.asOf}
        </p>
      </div>

      {data.baseline ? (
        <div className="grid gap-3 md:grid-cols-3">
          <BaselineStat
            label="Kassa nu"
            value={<MoneyValue value={data.baseline.availableCash} />}
          />
          <BaselineStat
            label="Nettoförmögenhet"
            value={<MoneyValue value={data.baseline.netWorth} />}
          />
          <BaselineStat
            label="Netto / mån"
            value={<MoneyValue value={data.baseline.monthlyNetSavings} signed />}
          />
        </div>
      ) : null}

      {data.points.length === 0 ? (
        <EmptyState
          title="Inga prognospunkter"
          description="Engine returnerade inga horizons."
        />
      ) : (
        <section className="overflow-hidden rounded-[16px] bg-surface-elevated">
          <ul className="divide-y divide-border">
            {data.points.map((p) => (
              <li
                key={p.label}
                className="flex justify-between gap-3 px-5 py-4 text-sm"
              >
                <div>
                  <p className="font-medium">{p.label}</p>
                  <p className="text-xs text-text-muted">{p.onDate}</p>
                </div>
                <div className="text-right">
                  <MoneyValue value={p.projectedCash} />
                  <p className="mt-1 text-xs text-text-secondary">
                    NW <MoneyValue value={p.projectedNetWorth} />
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-text-secondary">Backtest</h2>
            <p className="mt-1 text-xs text-text-muted">
              Jämför linjär prognos från {backtest?.pastAsOf ?? "30 dagar tillbaka"}{" "}
              med faktisk position.
            </p>
          </div>
          <button
            type="button"
            disabled={backtestBusy}
            onClick={() => void runBacktest()}
            className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            {backtestBusy ? "Kör…" : "Kör backtest"}
          </button>
        </div>
        {backtestError ? (
          <p className="text-sm text-negative" role="alert">
            {backtestError}
          </p>
        ) : null}
        {backtest ? (
          <ul className="divide-y divide-border rounded-[12px] border border-border">
            {backtest.metrics.map((m) => (
              <li
                key={m.horizonLabel}
                className="flex justify-between gap-3 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">{m.horizonLabel}</p>
                  <p className="text-xs text-text-muted">
                    MAPE kassa{" "}
                    {m.mapeCashPercent == null
                      ? "—"
                      : `${m.mapeCashPercent.toFixed(2)} %`}
                  </p>
                </div>
                <div className="text-right text-xs text-text-secondary">
                  |fel| <MoneyValue value={m.absCashError} />
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-[16px] bg-surface-elevated">
        <h2 className="border-b border-border px-5 py-3 text-sm text-text-secondary">
          Savings optimizer
        </h2>
        {data.optimizer.length === 0 ? (
          <p className="px-5 py-4 text-sm text-text-muted">
            Inga optimeringsförslag just nu.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {data.optimizer.map((o) => (
              <li
                key={o.id}
                className="flex justify-between gap-3 px-5 py-4 text-sm"
              >
                <div>
                  <p className="font-medium">{o.title}</p>
                  <p className="text-xs text-text-muted">effort {o.effort}</p>
                </div>
                <MoneyValue value={o.estimatedAnnualSaving} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function BaselineStat({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-[16px] bg-surface-elevated p-4">
      <p className="text-xs text-text-secondary">{label}</p>
      <div className="mt-1 text-lg font-medium">{value}</div>
    </div>
  );
}
