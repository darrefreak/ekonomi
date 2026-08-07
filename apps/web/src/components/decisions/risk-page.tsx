"use client";

import { useEffect, useState } from "react";
import type { RiskResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function RiskPage() {
  const [data, setData] = useState<RiskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ensureHouseholdSession()
      .then((id) => api.getRisk(id))
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label="Hämtar risk…" />;
  if (error || !data) {
    return <ErrorState title="Kunde inte hämta risk" description={error ?? ""} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Risk & hälsa
        </h1>
        <p className="mt-2 text-sm text-text-secondary">Dimensioner, inte en enda score · {data.asOf}</p>
      </div>
      <section className="space-y-3">
        <h2 className="text-sm text-text-secondary">Financial health</h2>
        {data.health.map((h) => (
          <article key={h.dimension} className="rounded-[16px] bg-surface-elevated p-5">
            <div className="flex justify-between gap-3">
              <p className="font-medium">{h.dimension}</p>
              <p className="tabular-nums text-sm">{h.score} · {h.level}</p>
            </div>
            <p className="mt-2 text-sm text-text-secondary">{h.summary}</p>
          </article>
        ))}
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
          </article>
        ))}
      </section>
    </div>
  );
}
