"use client";

import { useEffect, useState } from "react";
import type { ContractsResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { describeError } from "@/lib/error-message";

export function ContractsPage() {
  const [data, setData] = useState<ContractsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ensureHouseholdSession()
      .then((id) => api.getContracts(id))
      .then(setData)
      .catch((err: unknown) =>
        setError(describeError(err, "Kunde inte hämta avtalen")),
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label="Hämtar avtal…" />;
  if (error || !data) {
    return (
      <ErrorState title="Kunde inte hämta avtal" description={error ?? "Ingen data"} />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Avtal
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Förnyelser, uppsägningstider och bundna perioder · per {data.asOf}
        </p>
      </div>

      <section className="overflow-hidden rounded-[16px] bg-surface-elevated">
        <ul className="divide-y divide-border">
          {data.items.map((item) => (
            <li key={item.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {item.provider} · {item.contractType.replaceAll("_", " ")} ·{" "}
                    {item.status.toLowerCase()}
                  </p>
                  <p className="mt-2 text-xs text-text-secondary">
                    {item.renewalDate ? `Förnyelse ${item.renewalDate}` : "Ingen förnyelse"}
                    {item.cancellationDeadline
                      ? ` · sista uppsägning ${item.cancellationDeadline}`
                      : ""}
                    {item.noticePeriodDays
                      ? ` · ${item.noticePeriodDays} dagars uppsägning`
                      : ""}
                  </p>
                </div>
                <div className="text-right text-sm">
                  {item.monthlyCost ? <MoneyValue value={item.monthlyCost} /> : "—"}
                  {item.annualCost ? (
                    <p className="mt-1 text-xs text-text-secondary">
                      <MoneyValue value={item.annualCost} /> / år
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
