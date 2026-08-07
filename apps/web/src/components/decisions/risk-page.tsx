"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { RiskResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function RiskPage() {
  const [data, setData] = useState<RiskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const id = await ensureHouseholdSession();
      setData(await api.getRisk(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Något gick fel");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState label="Hämtar risk…" />;
  if (error) {
    return (
      <ErrorState
        title="Kunde inte hämta risk"
        description={error}
        onRetry={() => void load()}
      />
    );
  }
  if (!data) {
    return (
      <EmptyState
        title="Ingen riskdata"
        description="Live riskmotor körs när hushållsdata finns."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Risk & hälsa
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Live dimensioner · {data.source ?? "live-engine"} · {data.asOf}
        </p>
      </div>
      <section className="space-y-3">
        <h2 className="text-sm text-text-secondary">Financial health</h2>
        {data.health.length === 0 ? (
          <EmptyState title="Ingen health" description="Saknar underlag." />
        ) : (
          data.health.map((h) => (
            <article
              key={h.dimension}
              className="rounded-[16px] bg-surface-elevated p-5"
            >
              <div className="flex justify-between gap-3">
                <p className="font-medium">{h.dimension}</p>
                <p className="tabular-nums text-sm">
                  {h.score} · {h.level}
                </p>
              </div>
              <p className="mt-2 text-sm text-text-secondary">{h.summary}</p>
            </article>
          ))
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-sm text-text-secondary">Risksignaler</h2>
        {data.signals.map((s) => (
          <article key={s.id} className="rounded-[16px] bg-surface-elevated p-5">
            <div className="flex justify-between gap-3">
              <p className="font-medium">{s.title}</p>
              <p className="text-sm text-text-secondary">{s.level}</p>
            </div>
            <p className="mt-2 text-sm text-text-secondary">{s.detail}</p>
            {(s.evidence ?? []).length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                {(s.evidence ?? []).map((e) => (
                  <Link
                    key={`${e.kind}-${e.id}-${e.href}`}
                    href={e.href}
                    className="text-accent hover:underline"
                  >
                    {e.label} →
                  </Link>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}
