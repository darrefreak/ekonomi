"use client";

import { useEffect, useState } from "react";
import type { AdvisorBriefResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function AdvisorPage() {
  const [data, setData] = useState<AdvisorBriefResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ensureHouseholdSession()
      .then((id) => api.getAdvisorBrief(id))
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label="Hämtar AI-brief…" />;
  if (error || !data) {
    return <ErrorState title="Kunde inte hämta advisor" description={error ?? ""} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          AI-rådgivare
        </h1>
        <p className="mt-2 text-sm text-text-secondary">{data.headline}</p>
        <p className="mt-2 text-xs text-text-muted">{data.disclaimer}</p>
      </div>

      <ul className="space-y-3">
        {data.sections.map((s) => (
          <li key={s.title} className="rounded-[16px] bg-surface-elevated p-5">
            <p className="font-medium">{s.title}</p>
            <p className="mt-2 text-sm text-text-secondary">{s.detail}</p>
            <p className="mt-3 text-xs text-text-muted">
              Källverktyg: {s.sourceTools.join(", ")}
            </p>
          </li>
        ))}
      </ul>

      <section className="rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm text-text-secondary">Tool trace (explainability)</h2>
        <ul className="mt-3 space-y-2 text-xs text-text-muted">
          {data.toolTrace.map((t) => (
            <li key={t.tool}>
              {t.ok ? "✓" : "✗"} {t.tool}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
