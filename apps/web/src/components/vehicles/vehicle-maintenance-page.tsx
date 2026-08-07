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

const MAINT_KINDS = new Set(["SERVICE", "REPAIR", "TIRES", "INSURANCE", "TAX"]);

export function VehicleMaintenancePage({ vehicleId }: { vehicleId: string }) {
  const [data, setData] = useState<VehicleDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ensureHouseholdSession()
      .then((id) => api.getVehicle(id, vehicleId))
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [vehicleId]);

  const maintCosts = useMemo(() => {
    const list = data?.costs?.length ? data.costs : data?.recentCosts ?? [];
    return list.filter((c) => MAINT_KINDS.has(c.kind));
  }, [data]);

  if (loading) return <LoadingState label="Hämtar underhåll…" />;
  if (error || !data) {
    return (
      <ErrorState title="Kunde inte hämta underhåll" description={error ?? ""} />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Underhåll · {data.name}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Mätarställning, service och reparationer
        </p>
        <div className="mt-3">
          <VehicleDetailNav vehicleId={vehicleId} active="maintenance" />
        </div>
      </div>

      <section className="rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm text-text-secondary">Användning</h2>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-3">
          <div>
            <dt className="text-text-secondary">Årliga km</dt>
            <dd>{data.usage.annualKm.toLocaleString("sv-SE")}</dd>
          </div>
          <div>
            <dt className="text-text-secondary">Årliga mil</dt>
            <dd>{data.usage.annualSwedishMiles.toLocaleString("sv-SE")}</dd>
          </div>
          <div>
            <dt className="text-text-secondary">Senaste mätarställning</dt>
            <dd>
              {data.usage.currentOdometerKm
                ? `${data.usage.currentOdometerKm.toLocaleString("sv-SE")} km`
                : "—"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm text-text-secondary">Mätarhistorik</h2>
        {(data.odometerHistory ?? []).length === 0 ? (
          <EmptyState
            title="Ingen mätarhistorik"
            description="Registrera mätarställningar för att följa körsträcka."
          />
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {(data.odometerHistory ?? []).map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 py-3 text-sm"
              >
                <span className="text-text-secondary">{r.recordedOn}</span>
                <span>
                  {r.readingKm.toLocaleString("sv-SE")} km
                  <span className="ml-2 text-xs text-text-muted">{r.source}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="overflow-hidden rounded-[16px] bg-surface-elevated">
        <h2 className="border-b border-border px-5 py-3 text-sm text-text-secondary">
          Service & underhållskostnader
        </h2>
        {maintCosts.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Inga underhållsposter"
              description="Service, reparation, däck m.m. visas här."
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {maintCosts.map((c) => (
              <li
                key={c.id}
                className="flex items-start justify-between gap-3 px-5 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">{c.description ?? c.kind}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {c.occurredOn} · {c.kind.toLowerCase()}
                  </p>
                </div>
                <MoneyValue value={c.amount} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
