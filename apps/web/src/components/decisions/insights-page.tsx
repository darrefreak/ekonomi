"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { AnomaliesResponse, InsightsResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { describeError } from "@/lib/error-message";

export function InsightsPage() {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [anomalies, setAnomalies] = useState<AnomaliesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const id = await ensureHouseholdSession();
    setHouseholdId(id);
    const [insights, anomalyList] = await Promise.all([
      api.getInsights(id),
      api.getAnomalies(id),
    ]);
    setData(insights);
    setAnomalies(anomalyList);
  }, []);

  useEffect(() => {
    void load()
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [load]);

  async function dismiss(anomalyId: string) {
    if (!householdId) return;
    setBusyId(anomalyId);
    setError(null);
    try {
      const next = await api.dismissAnomaly(anomalyId, { householdId });
      setAnomalies(next);
    } catch (err) {
      setError(describeError(err, "Kunde inte avvisa"));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingState label="Hämtar insights…" />;
  if ((error && !data) || !data) {
    return <ErrorState title="Kunde inte hämta insights" description={error ?? ""} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Insights
        </h1>
        <p className="mt-2 text-sm text-text-secondary">{data.headline}</p>
      </div>

      {error ? (
        <p className="text-sm text-warning" role="alert">
          {error}
        </p>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-medium">Avvikelser</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Regelbaserade signaler (stora belopp, dubbletter, utebliven inkomst).
          </p>
        </div>
        {!anomalies || anomalies.items.length === 0 ? (
          <p className="rounded-[16px] bg-surface-elevated px-5 py-4 text-sm text-text-secondary">
            Inga aktiva avvikelser just nu.
          </p>
        ) : (
          <ul className="space-y-3">
            {anomalies.items.map((item) => (
              <li key={item.id} className="rounded-[16px] bg-surface-elevated p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs uppercase tracking-wide text-text-muted">
                      {item.severity} · {item.ruleKey}
                    </p>
                    <p className="mt-1 font-medium">{item.title}</p>
                    <p className="mt-2 text-sm text-text-secondary">{item.detail}</p>
                    {item.href ? (
                      <Link href={item.href} className="mt-2 inline-block text-sm text-accent">
                        Visa underlag
                      </Link>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void dismiss(item.id)}
                    className="min-h-11 rounded-[12px] border border-border-strong px-4 text-sm disabled:opacity-50"
                  >
                    Avvisa
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ul className="space-y-3">
        {data.items.map((item) => (
          <li key={item.id} className="rounded-[16px] bg-surface-elevated p-5">
            <p className="text-xs uppercase tracking-wide text-text-muted">{item.kind}</p>
            <p className="mt-1 font-medium">{item.title}</p>
            <p className="mt-2 text-sm text-text-secondary">{item.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
