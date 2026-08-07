"use client";

import { useEffect, useState } from "react";
import type { ImportsResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function ImportsPage() {
  const [data, setData] = useState<ImportsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ensureHouseholdSession()
      .then((id) => api.getImports(id))
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label="Hämtar imports…" />;
  if (error || !data) {
    return <ErrorState title="Kunde inte hämta imports" description={error ?? ""} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Imports
        </h1>
        <p className="mt-2 text-sm text-text-secondary">Import batches · {data.asOf}</p>
      </div>
      <ul className="space-y-3">
        {data.batches.map((b) => (
          <li key={b.id} className="rounded-[16px] bg-surface-elevated p-5 text-sm">
            <p className="font-medium">
              {b.status} · {b.totalRecords} records ({b.createdCount} created)
            </p>
            <p className="mt-1 text-xs text-text-muted">
              {b.startedAt}
              {b.completedAt ? ` → ${b.completedAt}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
