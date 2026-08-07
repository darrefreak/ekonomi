"use client";

import { useEffect, useState } from "react";
import type { OpportunitiesResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function OpportunitiesPage() {
  const [data, setData] = useState<OpportunitiesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ensureHouseholdSession()
      .then((id) => api.getOpportunities(id))
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label="Hämtar opportunities…" />;
  if (error || !data) {
    return <ErrorState title="Kunde inte hämta opportunities" description={error ?? ""} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Opportunities
        </h1>
        <p className="mt-2 text-sm text-text-secondary">as of {data.asOf}</p>
      </div>
      <ul className="space-y-3">
        {data.items.map((item) => (
          <li key={item.id} className="rounded-[16px] bg-surface-elevated p-5">
            <div className="flex justify-between gap-3">
              <div>
                <p className="font-medium">{item.title}</p>
                <p className="mt-2 text-sm text-text-secondary">{item.description}</p>
                <p className="mt-2 text-xs text-text-muted">
                  {item.status} · {item.effort} effort · prio {item.priority}
                </p>
              </div>
              {item.estimatedAnnualSaving ? (
                <div className="text-right text-sm">
                  <MoneyValue value={item.estimatedAnnualSaving} />
                  <p className="text-xs text-text-secondary">/ år</p>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
