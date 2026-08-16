"use client";

import { useEffect, useMemo, useState } from "react";
import type { VehicleDetailDto } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { VehicleDetailNav } from "./vehicle-subnav";
import { describeError } from "@/lib/error-message";

export function VehicleCostsPage({ vehicleId }: { vehicleId: string }) {
  const [data, setData] = useState<VehicleDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<string>("ALL");

  useEffect(() => {
    void ensureHouseholdSession()
      .then((id) => api.getVehicle(id, vehicleId))
      .then(setData)
      .catch((err: unknown) =>
        setError(describeError(err, "Kunde inte hämta fordonskostnaderna")),
      )
      .finally(() => setLoading(false));
  }, [vehicleId]);

  const costs = useMemo(() => {
    const list = data?.costs?.length ? data.costs : data?.recentCosts ?? [];
    if (kind === "ALL") return list;
    return list.filter((c) => c.kind === kind);
  }, [data, kind]);

  const kinds = useMemo(() => {
    const list = data?.costs?.length ? data.costs : data?.recentCosts ?? [];
    return [...new Set(list.map((c) => c.kind))].sort();
  }, [data]);

  if (loading) return <LoadingState label="Hämtar kostnader…" />;
  if (error || !data) {
    return (
      <ErrorState title="Kunde inte hämta kostnader" description={error ?? ""} />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Kostnader · {data.name}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Fordonets bokförda kostnader under de senaste 12 månaderna
        </p>
        <div className="mt-3">
          <VehicleDetailNav vehicleId={vehicleId} active="costs" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <button
          type="button"
          onClick={() => setKind("ALL")}
          className={`min-h-11 px-3 ${kind === "ALL" ? "text-accent" : "text-text-secondary"}`}
        >
          Alla
        </button>
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`min-h-11 px-3 ${kind === k ? "text-accent" : "text-text-secondary"}`}
          >
            {k.toLowerCase()}
          </button>
        ))}
      </div>

      {costs.length === 0 ? (
        <EmptyState
          title="Inga kostnader"
          description="När cost events finns visas de här."
        />
      ) : (
        <section className="overflow-hidden rounded-[16px] bg-surface-elevated">
          <ul className="divide-y divide-border">
            {costs.map((c) => (
              <li
                key={c.id}
                className="flex items-start justify-between gap-3 px-5 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">{c.description ?? c.kind}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {c.occurredOn} · {c.kind.toLowerCase()}
                    {!c.isEconomicCost ? " · cash only" : ""}
                    {c.odometerKm != null
                      ? ` · ${c.odometerKm.toLocaleString("sv-SE")} km`
                      : ""}
                  </p>
                </div>
                <MoneyValue value={c.amount} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm text-text-secondary">
          Ledger-händelser med vehicleId
        </h2>
        {(data.linkedEvents ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">
            Inga financial events kopplade ännu.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {(data.linkedEvents ?? []).map((e) => (
              <li
                key={e.id}
                className="flex items-start justify-between gap-3 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">{e.description ?? "Händelse"}</p>
                  <p className="mt-1 text-xs text-text-muted">{e.occurredOn}</p>
                </div>
                <MoneyValue value={e.amount} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
