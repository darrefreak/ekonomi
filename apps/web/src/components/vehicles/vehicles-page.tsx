"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { VehiclesResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { AddVehicleForm } from "./add-vehicle-form";
import { VehicleHouseholdNav } from "./vehicle-subnav";
import { describeError } from "@/lib/error-message";

export function VehiclesPage() {
  const router = useRouter();
  const [data, setData] = useState<VehiclesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    void ensureHouseholdSession()
      .then((id) => api.listVehicles(id))
      .then(setData)
      .catch((err: unknown) =>
        setError(describeError(err, "Kunde inte hämta fordonen")),
      )
      .finally(() => setLoading(false));
  }, []);

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
          Fordon
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Ägande, total kostnad och eget kapital · per {data.asOf}
        </p>
        <div className="mt-3">
          <VehicleHouseholdNav active="/vehicles" />
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="mt-4 min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-on-accent"
        >
          {adding ? "Stäng formuläret" : "Lägg till fordon"}
        </button>
      </div>

      {adding ? (
        <AddVehicleForm
          onCancel={() => setAdding(false)}
          onCreated={(vehicleId) => {
            setAdding(false);
            router.push(`/vehicles/${vehicleId}`);
          }}
        />
      ) : null}

      {data.items.length === 0 ? (
        <EmptyState
          title="Inga fordon ännu"
          description="Lägg till ett fordon för att se TCO, equity och marknadsjämförelser."
        />
      ) : null}

      <ul className="space-y-3">
        {data.items.map((v) => (
          <li key={v.id}>
            <Link
              href={`/vehicles/${v.id}`}
              className="block rounded-[16px] bg-surface-elevated p-5 transition hover:bg-surface-muted"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {v.name}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    {v.make} {v.model} {v.modelYear}
                    {v.registrationNumber ? ` · ${v.registrationNumber}` : ""}
                    {` · ${v.ownershipType.toLowerCase()}`}
                  </p>
                </div>
                <div className="text-right text-sm">
                  {v.monthlyEconomicCost ? (
                    <>
                      <MoneyValue value={v.monthlyEconomicCost} />
                      <p className="mt-1 text-xs text-text-secondary">ekonomisk / mån</p>
                    </>
                  ) : null}
                </div>
              </div>
              <dl className="mt-4 grid gap-2 text-sm md:grid-cols-2">
                <div>
                  <dt className="text-text-secondary">Värde (mid)</dt>
                  <dd>
                    {v.estimatedValueMid ? (
                      <MoneyValue value={v.estimatedValueMid} />
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-secondary">Equity</dt>
                  <dd>
                    {v.netEquity ? <MoneyValue value={v.netEquity} signed /> : "—"}
                  </dd>
                </div>
              </dl>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
