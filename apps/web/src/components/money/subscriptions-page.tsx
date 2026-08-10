"use client";

import { useCallback, useEffect, useState } from "react";
import type { SubscriptionsResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { describeError } from "@/lib/error-message";

type RecurringStatus = "CONFIRMED" | "DISMISSED" | "PAUSED" | "DETECTED";

export function SubscriptionsPage() {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [data, setData] = useState<SubscriptionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const id = await ensureHouseholdSession();
    setHouseholdId(id);
    setData(await api.getSubscriptions(id));
  }, []);

  useEffect(() => {
    void load()
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [load]);

  async function setStatus(recurringId: string, status: RecurringStatus) {
    if (!householdId) return;
    setBusyId(recurringId);
    setError(null);
    try {
      const next = await api.updateRecurringStatus(recurringId, {
        householdId,
        status,
      });
      setData(next);
    } catch (err) {
      setError(describeError(err, "Kunde inte uppdatera"));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingState label="Hämtar abonnemang…" />;
  if ((error && !data) || !data) {
    return (
      <ErrorState
        title="Kunde inte hämta abonnemang"
        description={error ?? "Ingen data"}
        onRetry={() => void load()}
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

      {error ? (
        <p className="text-sm text-warning" role="alert">
          {error}
        </p>
      ) : null}

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
            <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{item.name}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {item.status.toLowerCase()} · {item.kind}
                  {item.nextExpectedOn ? ` · väntas ${item.nextExpectedOn}` : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.status !== "CONFIRMED" ? (
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void setStatus(item.id, "CONFIRMED")}
                      className="min-h-10 rounded-[12px] border border-border-strong px-3 text-xs disabled:opacity-50"
                    >
                      Bekräfta
                    </button>
                  ) : null}
                  {item.status !== "DISMISSED" ? (
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void setStatus(item.id, "DISMISSED")}
                      className="min-h-10 rounded-[12px] border border-border-strong px-3 text-xs disabled:opacity-50"
                    >
                      Avvisa
                    </button>
                  ) : null}
                  {item.status !== "PAUSED" ? (
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void setStatus(item.id, "PAUSED")}
                      className="min-h-10 rounded-[12px] border border-border-strong px-3 text-xs disabled:opacity-50"
                    >
                      Pausa
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void setStatus(item.id, "DETECTED")}
                      className="min-h-10 rounded-[12px] border border-border-strong px-3 text-xs disabled:opacity-50"
                    >
                      Återaktivera
                    </button>
                  )}
                </div>
              </div>
              <MoneyValue value={item.amount} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
