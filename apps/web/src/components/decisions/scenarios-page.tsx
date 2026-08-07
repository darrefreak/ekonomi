"use client";

import { useEffect, useState } from "react";
import type { ScenariosResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function ScenariosPage() {
  const [data, setData] = useState<ScenariosResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ensureHouseholdSession()
      .then((id) => api.getScenarios(id))
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label="Hämtar scenarios…" />;
  if (error || !data) {
    return <ErrorState title="Kunde inte hämta scenarios" description={error ?? ""} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Scenarios
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Simuleringar utan att mutera data · {data.asOf}
        </p>
      </div>
      <ul className="space-y-3">
        {data.items.map((s) => (
          <li key={s.id} className="rounded-[16px] bg-surface-elevated p-5">
            <div className="flex justify-between gap-3">
              <div>
                <p className="font-medium">{s.name}</p>
                <p className="mt-2 text-sm text-text-secondary">{s.description}</p>
              </div>
              <div className="text-right text-sm">
                <MoneyValue value={s.projectedMonthlyDelta} signed />
                <p className="text-xs text-text-secondary">/ mån</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
