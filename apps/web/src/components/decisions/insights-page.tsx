"use client";

import { useEffect, useState } from "react";
import type { InsightsResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function InsightsPage() {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ensureHouseholdSession()
      .then((id) => api.getInsights(id))
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label="Hämtar insights…" />;
  if (error || !data) {
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
