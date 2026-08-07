"use client";

import { useEffect, useState } from "react";
import type { IntegrationsResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function IntegrationsPage() {
  const [data, setData] = useState<IntegrationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  async function load() {
    const id = await ensureHouseholdSession();
    setData(await api.getIntegrations(id));
  }

  useEffect(() => {
    void load()
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label="Hämtar integrationer…" />;
  if (error || !data) {
    return <ErrorState title="Kunde inte hämta integrationer" description={error ?? ""} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
            Integrationer
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Connector-status + fake sync · {data.asOf}
          </p>
        </div>
        <button
          type="button"
          disabled={syncing}
          className="rounded-[12px] bg-accent px-4 py-2 text-sm text-white disabled:opacity-60"
          onClick={() => {
            setSyncing(true);
            void ensureHouseholdSession()
              .then((id) => api.triggerFakeSync(id))
              .then(() => load())
              .catch((err: Error) => setError(err.message))
              .finally(() => setSyncing(false));
          }}
        >
          {syncing ? "Synkar…" : "Fake sync"}
        </button>
      </div>
      <ul className="space-y-3">
        {data.sources.map((s) => (
          <li key={s.id} className="rounded-[16px] bg-surface-elevated p-5">
            <p className="font-medium">{s.name}</p>
            <p className="mt-1 text-xs text-text-muted">
              {s.connectionStatus} · {s.domain} · {s.freshnessLabel ?? "okänd freshness"}
            </p>
          </li>
        ))}
      </ul>
      <section className="overflow-hidden rounded-[16px] bg-surface-elevated">
        <h2 className="border-b border-border px-5 py-3 text-sm text-text-secondary">
          Senaste syncs
        </h2>
        <ul className="divide-y divide-border">
          {data.recentSyncs.map((s) => (
            <li key={s.id} className="px-5 py-3 text-sm">
              <p className="font-medium">
                {s.status} · {s.recordsFetched} poster
              </p>
              <p className="text-xs text-text-muted">{s.message}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
