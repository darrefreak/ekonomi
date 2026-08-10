"use client";

import { useCallback, useEffect, useState } from "react";
import type { IntegrationsResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { describeError } from "@/lib/error-message";

const NEEDS_RECONNECT = new Set([
  "AUTH_REQUIRED",
  "ERROR",
  "DISCONNECTED",
  "DEGRADED",
]);

export function IntegrationsPage() {
  const [data, setData] = useState<IntegrationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [providerId, setProviderId] = useState("mock-manual-csv");
  const [customName, setCustomName] = useState("");

  const load = useCallback(async () => {
    const id = await ensureHouseholdSession();
    setData(await api.getIntegrations(id));
  }, []);

  useEffect(() => {
    void load()
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [load]);

  async function run(key: string, action: (householdId: string) => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      const householdId = await ensureHouseholdSession();
      await action(householdId);
      await load();
    } catch (err) {
      setError(describeError(err, "Något gick fel"));
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <LoadingState label="Hämtar integrationer…" />;
  if (!data) {
    return <ErrorState title="Kunde inte hämta integrationer" description={error ?? ""} />;
  }

  const providers = data.providers ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
            Integrationer
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Källor, hälsa och reconnect · mock connectors · {data.asOf}
          </p>
        </div>
        <button
          type="button"
          disabled={busy !== null}
          className="rounded-[12px] bg-accent px-4 py-2 text-sm text-white disabled:opacity-60"
          onClick={() =>
            void run("sync-all", (id) => api.triggerFakeSync(id))
          }
        >
          {busy === "sync-all" ? "Synkar…" : "Fake sync (första källa)"}
        </button>
      </div>

      {error ? (
        <p className="rounded-[12px] bg-surface-elevated px-4 py-3 text-sm text-warning">
          {error}
        </p>
      ) : null}

      <section className="rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm font-medium text-text-secondary">Lägg till källa</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <label className="text-sm text-text-secondary">
            Provider
            <select
              className="mt-1 block min-h-11 rounded-[12px] border border-border bg-surface px-3 py-2 text-text-primary"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
            >
              {providers.map((p) => (
                <option key={p.providerId} value={p.providerId}>
                  {p.name} ({p.domain})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-text-secondary">
            Namn (valfritt)
            <input
              className="mt-1 block min-h-11 rounded-[12px] border border-border bg-surface px-3 py-2 text-text-primary"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Eg. Extra SEB"
            />
          </label>
          <button
            type="button"
            disabled={busy !== null}
            className="self-end rounded-[12px] border border-border px-4 py-2 text-sm disabled:opacity-60"
            onClick={() =>
              void run("create", (householdId) =>
                api.createSource({
                  householdId,
                  providerId,
                  name: customName.trim() || undefined,
                }),
              )
            }
          >
            {busy === "create" ? "Skapar…" : "Skapa källa"}
          </button>
        </div>
      </section>

      {data.sources.length === 0 ? (
        <EmptyState
          title="Inga aktiva källor"
          description="Lägg till en mock-provider ovan för att börja importera."
        />
      ) : (
        <ul className="space-y-3">
          {data.sources.map((s) => (
            <li key={s.id} className="rounded-[16px] bg-surface-elevated p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {s.connectionStatus} · {s.domain} · {s.providerId}
                  </p>
                  <p className="mt-1 text-xs text-text-secondary">
                    Freshness: {s.freshnessLabel ?? "okänd"}
                    {s.lastSyncedAt ? ` · senast ${s.lastSyncedAt}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {NEEDS_RECONNECT.has(s.connectionStatus) ? (
                    <button
                      type="button"
                      disabled={busy !== null}
                      className="rounded-[12px] bg-accent px-3 py-2 text-sm text-white disabled:opacity-60"
                      onClick={() =>
                        void run(`reconnect-${s.id}`, (householdId) =>
                          api.reconnectSource(s.id, { householdId }),
                        )
                      }
                    >
                      {busy === `reconnect-${s.id}` ? "…" : "Reconnect"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy !== null}
                      className="rounded-[12px] border border-border px-3 py-2 text-sm disabled:opacity-60"
                      onClick={() =>
                        void run(`sync-${s.id}`, (householdId) =>
                          api.syncSource(householdId, s.id),
                        )
                      }
                    >
                      {busy === `sync-${s.id}` ? "…" : "Sync"}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy !== null}
                    className="rounded-[12px] border border-border px-3 py-2 text-sm text-text-secondary disabled:opacity-60"
                    onClick={() =>
                      void run(`archive-${s.id}`, (householdId) =>
                        api.archiveSource(householdId, s.id),
                      )
                    }
                  >
                    Koppla från
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="overflow-hidden rounded-[16px] bg-surface-elevated">
        <h2 className="border-b border-border px-5 py-3 text-sm text-text-secondary">
          Senaste syncs
        </h2>
        {data.recentSyncs.length === 0 ? (
          <p className="px-5 py-4 text-sm text-text-muted">Inga syncs ännu.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.recentSyncs.map((s) => (
              <li key={s.id} className="px-5 py-3 text-sm">
                <p className="font-medium">
                  {s.sourceName ?? "Okänd källa"} · {s.status} · {s.recordsFetched}{" "}
                  poster
                </p>
                <p className="text-xs text-text-muted">{s.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
