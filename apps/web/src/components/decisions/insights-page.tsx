"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { AnomaliesResponse, InsightsResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { describeError } from "@/lib/error-message";
import { insightsHub } from "../layout/nav-config";

const descriptions: Record<string, string> = {
  "/what-changed": "Se vad som avviker från ert normala mönster",
  "/weekly": "En kort sammanfattning av veckan",
  "/opportunities": "Konkreta sätt att förbättra ekonomin",
  "/reports": "Utforska inkomster, utgifter och mottagare",
  "/liquidity": "Förstå hur stor buffert ni behöver",
  "/savings": "Prioritera nästa krona i överskott",
  "/risk": "Se risker och hushållets motståndskraft",
};

const severityLabels: Record<string, string> = {
  CRITICAL: "Kräver åtgärd",
  HIGH: "Viktigt",
  MEDIUM: "Värt att kontrollera",
  LOW: "För kännedom",
};

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
      .catch((err: unknown) =>
        setError(describeError(err, "Kunde inte hämta insikter")),
      )
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

  if (loading) return <LoadingState label="Hämtar insikter…" />;
  if ((error && !data) || !data) {
    return <ErrorState title="Kunde inte hämta insikter" description={error ?? ""} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Insikter
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-text-secondary">
          Förstå vad som har förändrats, varför det hände och vad ni kan göra
          härnäst.
        </p>
      </div>

      <nav aria-label="Insikter">
        <ul className="grid gap-3 sm:grid-cols-2">
          {insightsHub.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex min-h-20 flex-col justify-center rounded-[16px] bg-surface-elevated px-4 py-3 transition hover:bg-surface-muted"
              >
                <span className="text-sm font-medium text-text-primary">
                  {item.label}
                </span>
                <span className="mt-1 text-xs text-text-muted">
                  {descriptions[item.href]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {error ? (
        <p className="text-sm text-warning" role="alert">
          {error}
        </p>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-medium">Aktuellt för hushållet</h2>
          <p className="mt-1 text-sm text-text-secondary">{data.headline}</p>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-medium">Saker att kontrollera</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Oväntade belopp, möjliga dubbletter och inkomster som saknas.
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
                      {severityLabels[item.severity] ?? "Kontrollera"}
                    </p>
                    <p className="mt-1 font-medium">{item.title}</p>
                    <p className="mt-2 text-sm text-text-secondary">{item.detail}</p>
                    {item.href ? (
                      <Link
                        href={item.href}
                        className="mt-2 inline-flex min-h-11 items-center text-sm text-accent"
                      >
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
                    Avfärda signal
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
            <p className="mt-1 font-medium">{item.title}</p>
            <p className="mt-2 text-sm text-text-secondary">{item.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
