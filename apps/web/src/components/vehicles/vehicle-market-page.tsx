"use client";

import { useEffect, useState } from "react";
import type { VehicleMarketResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function VehicleMarketPage({
  title = "Fordonsmarknad",
}: {
  title?: string;
}) {
  const [data, setData] = useState<VehicleMarketResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ensureHouseholdSession()
      .then((id) => api.getVehicleMarket(id))
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label="Hämtar marknadsdata…" />;
  if (error || !data) {
    return <ErrorState title="Kunde inte hämta marknad" description={error ?? ""} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          {title}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Mock market intelligence · as of {data.asOf}
        </p>
      </div>

      {data.snapshot ? (
        <section className="rounded-[16px] bg-surface-elevated p-5">
          <h2 className="text-sm text-text-secondary">Ask-intervall (nuvarande bil)</h2>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-3">
            <div>
              <dt className="text-text-secondary">Låg</dt>
              <dd>
                <MoneyValue value={data.snapshot.askLow} />
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">Mid</dt>
              <dd>
                <MoneyValue value={data.snapshot.askMid} />
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">Hög</dt>
              <dd>
                <MoneyValue value={data.snapshot.askHigh} />
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-text-muted">
            n={data.snapshot.sampleSize}
            {data.snapshot.notes ? ` · ${data.snapshot.notes}` : ""}
          </p>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm text-text-secondary">Kandidater</h2>
        {data.candidates.map((c) => (
          <article key={c.id} className="rounded-[16px] bg-surface-elevated p-5">
            <div className="flex justify-between gap-3">
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {c.make} {c.model} {c.modelYear}
                </p>
              </div>
              <div className="text-right text-sm">
                <MoneyValue value={c.askPrice} />
                <p className="mt-1 text-xs text-text-secondary">
                  <MoneyValue value={c.estimatedMonthlyEconomic} /> / mån
                </p>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm text-text-secondary">Jämförelser</h2>
        {data.comparisons.map((c) => (
          <article key={c.id} className="rounded-[16px] bg-surface-elevated p-5">
            <div className="flex justify-between gap-3">
              <div>
                <p className="font-medium">{c.title}</p>
                <p className="mt-2 text-sm text-text-secondary">{c.summary}</p>
              </div>
              <div className="text-right text-sm">
                <p className="uppercase tracking-wide text-text-muted">{c.recommendation}</p>
                <MoneyValue value={c.monthlyDelta} signed />
              </div>
            </div>
          </article>
        ))}
      </section>

      {data.replacement ? (
        <section className="rounded-[16px] bg-surface-elevated p-5">
          <h2 className="text-sm text-text-secondary">Replacement / säljfönster</h2>
          <p className="mt-2 font-medium">{data.replacement.status}</p>
          <p className="mt-2 text-sm text-text-secondary">{data.replacement.summary}</p>
          <p className="mt-3 text-xs text-text-muted">
            {data.replacement.sellWindowStart ?? "?"} –{" "}
            {data.replacement.sellWindowEnd ?? "?"}
          </p>
        </section>
      ) : null}
    </div>
  );
}
