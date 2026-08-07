"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { VehicleDetailDto } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { VehicleDetailNav, VehicleHouseholdNav } from "./vehicle-subnav";

export function VehicleDetailPage({ vehicleId }: { vehicleId: string }) {
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

  if (loading) return <LoadingState label="Hämtar fordon…" />;
  if (error || !data) {
    return (
      <ErrorState title="Kunde inte hämta fordon" description={error ?? "Ingen data"} />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          {data.name}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          {data.make} {data.model} {data.modelYear}
          {data.registrationNumber ? ` · ${data.registrationNumber}` : ""}
          {` · ${data.fuelType}`}
        </p>
        <div className="mt-3 space-y-2">
          <VehicleHouseholdNav />
          <VehicleDetailNav vehicleId={vehicleId} active="overview" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Ekonomisk / mån" value={<MoneyValue value={data.metrics.monthlyEconomicCost} />} />
        <Stat label="Equity" value={<MoneyValue value={data.metrics.netEquity} signed />} />
        <Stat
          label="Kostnad / mil"
          value={<MoneyValue value={data.metrics.costPerSwedishMile} />}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-[16px] bg-surface-elevated p-5">
          <h2 className="text-sm text-text-secondary">Värdering</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Låg" value={data.valuation.low ? <MoneyValue value={data.valuation.low} /> : "—"} />
            <Row label="Mid" value={data.valuation.mid ? <MoneyValue value={data.valuation.mid} /> : "—"} />
            <Row label="Hög" value={data.valuation.high ? <MoneyValue value={data.valuation.high} /> : "—"} />
          </dl>
        </section>
        <section className="rounded-[16px] bg-surface-elevated p-5">
          <h2 className="text-sm text-text-secondary">Finansiering & användning</h2>
          <dl className="mt-4 space-y-2 text-sm">
            {data.finance ? (
              <>
                <Row label="Långivare" value={data.finance.lender} />
                <Row label="Kvar skuld" value={<MoneyValue value={data.finance.remaining} />} />
                <Row label="Ränta" value={`${data.finance.interestRatePercent.toFixed(2)} %`} />
              </>
            ) : (
              <p className="text-text-muted">Ingen finansiering</p>
            )}
            <Row label="Årliga km" value={`${data.usage.annualKm.toLocaleString("sv-SE")} km`} />
            <Row
              label="Årliga mil"
              value={`${data.usage.annualSwedishMiles.toLocaleString("sv-SE")} mil`}
            />
            <Row
              label="Mätarställning"
              value={
                data.usage.currentOdometerKm
                  ? `${data.usage.currentOdometerKm.toLocaleString("sv-SE")} km`
                  : "—"
              }
            />
          </dl>
        </section>
      </div>

      <section className="rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm text-text-secondary">Projektterad TCO</h2>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-3">
          <Row label="12 mån" value={<MoneyValue value={data.metrics.projectedTco12m} />} />
          <Row label="24 mån" value={<MoneyValue value={data.metrics.projectedTco24m} />} />
          <Row label="36 mån" value={<MoneyValue value={data.metrics.projectedTco36m} />} />
        </dl>
      </section>

      <section className="overflow-hidden rounded-[16px] bg-surface-elevated">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <h2 className="text-sm text-text-secondary">Senaste kostnader</h2>
          <Link
            href={`/vehicles/${vehicleId}/costs`}
            className="text-sm text-accent hover:underline"
          >
            Alla →
          </Link>
        </div>
        <ul className="divide-y divide-border">
          {data.recentCosts.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
              <div>
                <p className="font-medium">{c.description ?? c.kind}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {c.occurredOn} · {c.kind.toLowerCase()}
                  {!c.isEconomicCost ? " · cash only" : ""}
                </p>
              </div>
              <MoneyValue value={c.amount} />
            </li>
          ))}
        </ul>
      </section>

      {(data.linkedEvents ?? []).length > 0 ? (
        <section className="rounded-[16px] bg-surface-elevated p-5">
          <h2 className="text-sm text-text-secondary">
            Ledger-kopplade händelser
          </h2>
          <ul className="mt-4 divide-y divide-border">
            {(data.linkedEvents ?? []).slice(0, 8).map((e) => (
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
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <section className="rounded-[16px] bg-surface-elevated p-5">
      <p className="text-sm text-text-secondary">{label}</p>
      <div className="mt-2 text-lg">{value}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-text-secondary">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
