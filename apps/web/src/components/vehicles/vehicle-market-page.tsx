"use client";

import { useEffect, useMemo, useState } from "react";
import type { VehicleMarketResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { VehicleDetailNav, VehicleHouseholdNav } from "./vehicle-subnav";

export type MarketFocus =
  | "market"
  | "candidates"
  | "compare"
  | "valuation"
  | "replacement";

export function VehicleMarketPage({
  title,
  focus = "market",
  vehicleId,
}: {
  title: string;
  focus?: MarketFocus;
  vehicleId?: string;
}) {
  const [data, setData] = useState<VehicleMarketResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ensureHouseholdSession()
      .then((id) => api.getVehicleMarket(id, vehicleId))
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [vehicleId]);

  const activeHref = useMemo(() => {
    if (focus === "candidates") return "/vehicles/candidates";
    if (focus === "compare") return "/vehicles/compare";
    return "/vehicles/market";
  }, [focus]);

  if (loading) return <LoadingState label="Hämtar marknadsanalys…" />;
  if (error || !data) {
    return (
      <ErrorState title="Kunde inte hämta marknad" description={error ?? ""} />
    );
  }

  const showSnapshot = focus === "market" || focus === "valuation";
  const showCandidates = focus === "market" || focus === "candidates";
  const showCompare = focus === "market" || focus === "compare";
  const showReplace = focus === "market" || focus === "replacement";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          {title}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Live analys över mock-annonser · {data.analysisSource} · as of{" "}
          {data.asOf}
        </p>
        {data.currentMonthlyEconomic ? (
          <p className="mt-2 text-sm text-text-secondary">
            Nuvarande ekonomisk / mån:{" "}
            <MoneyValue value={data.currentMonthlyEconomic} />
          </p>
        ) : null}
        <div className="mt-3 space-y-2">
          <VehicleHouseholdNav active={activeHref} />
          {vehicleId || data.vehicleId ? (
            <VehicleDetailNav
              vehicleId={vehicleId ?? data.vehicleId!}
              active={
                focus === "valuation"
                  ? "valuation"
                  : focus === "replacement"
                    ? "replacement"
                    : "overview"
              }
            />
          ) : null}
        </div>
      </div>

      {showSnapshot ? (
        data.snapshot ? (
          <section className="rounded-[16px] bg-surface-elevated p-5">
            <h2 className="text-sm text-text-secondary">
              Ask-intervall (mock-marknad)
            </h2>
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
        ) : (
          <EmptyState
            title="Ingen marknadssnapshot"
            description="Mock ask-priser saknas för fordonet."
          />
        )
      ) : null}

      {showCandidates ? (
        <section className="space-y-3">
          <h2 className="text-sm text-text-secondary">Kandidater (mock)</h2>
          {data.candidates.length === 0 ? (
            <EmptyState
              title="Inga kandidater"
              description="Lägg till mock-annonser för jämförelse."
            />
          ) : (
            data.candidates.map((c) => (
              <article
                key={c.id}
                className="rounded-[16px] bg-surface-elevated p-5"
              >
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="mt-1 text-xs text-text-muted">
                      {c.make} {c.model} {c.modelYear}
                      {c.notes ? ` · ${c.notes}` : ""}
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
            ))
          )}
        </section>
      ) : null}

      {showCompare ? (
        <section className="space-y-3">
          <h2 className="text-sm text-text-secondary">
            Keep vs replace (live)
          </h2>
          {data.comparisons.length === 0 ? (
            <EmptyState
              title="Inga jämförelser"
              description="Kräver fordon + mock-kandidater."
            />
          ) : (
            data.comparisons.map((c) => (
              <article
                key={c.id}
                className="rounded-[16px] bg-surface-elevated p-5"
              >
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-medium">{c.title}</p>
                    <p className="mt-2 text-sm text-text-secondary">
                      {c.summary}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="uppercase tracking-wide text-text-muted">
                      {c.recommendation}
                    </p>
                    <MoneyValue value={c.monthlyDelta} signed />
                    {c.confidence != null ? (
                      <p className="mt-1 text-xs text-text-muted">
                        konfidens {(c.confidence * 100).toFixed(0)} %
                      </p>
                    ) : null}
                  </div>
                </div>
              </article>
            ))
          )}
        </section>
      ) : null}

      {showReplace && data.replacement ? (
        <section className="rounded-[16px] bg-surface-elevated p-5">
          <h2 className="text-sm text-text-secondary">
            Replacement / säljfönster (live)
          </h2>
          <p className="mt-2 font-medium">{data.replacement.status}</p>
          <p className="mt-2 text-sm text-text-secondary">
            {data.replacement.summary}
          </p>
          {data.replacement.currentEquity ? (
            <p className="mt-3 text-sm">
              Nuvarande equity:{" "}
              <MoneyValue value={data.replacement.currentEquity} signed />
            </p>
          ) : null}
          {data.replacement.monthsToBindingEnd != null ? (
            <p className="mt-1 text-xs text-text-muted">
              Månader till finansslut: {data.replacement.monthsToBindingEnd}
            </p>
          ) : null}
          <p className="mt-3 text-xs text-text-muted">
            Fönster: {data.replacement.sellWindowStart ?? "?"} –{" "}
            {data.replacement.sellWindowEnd ?? "?"}
          </p>
        </section>
      ) : null}
    </div>
  );
}
