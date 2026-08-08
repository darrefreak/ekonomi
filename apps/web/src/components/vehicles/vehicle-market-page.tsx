"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { VehicleMarketResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { kronorToMinorString } from "@/lib/money-input";
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
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [data, setData] = useState<VehicleMarketResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newMake, setNewMake] = useState("Volvo");
  const [newModel, setNewModel] = useState("XC60");
  const [newYear, setNewYear] = useState("2020");
  const [newAsk, setNewAsk] = useState("295000");
  const [newMonthly, setNewMonthly] = useState("4800");

  const reload = useCallback(async (hid: string, vid?: string) => {
    const market = await api.getVehicleMarket(hid, vid);
    setData(market);
  }, []);

  useEffect(() => {
    void ensureHouseholdSession()
      .then(async (id) => {
        setHouseholdId(id);
        await reload(id, vehicleId);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [vehicleId, reload]);

  const activeHref = useMemo(() => {
    if (focus === "candidates") return "/vehicles/candidates";
    if (focus === "compare") return "/vehicles/compare";
    return "/vehicles/market";
  }, [focus]);

  const askLabel =
    data?.analytics?.stats?.askLabel ??
    data?.snapshot?.askLabel ??
    "Liknande bilar annonseras för…";

  async function handleCreateCandidate(e: React.FormEvent) {
    e.preventDefault();
    if (!householdId) return;
    setFormError(null);
    const askMinor = kronorToMinorString(newAsk);
    const monthlyMinor = kronorToMinorString(newMonthly);
    const year = Number.parseInt(newYear, 10);
    if (!askMinor || !monthlyMinor || !Number.isFinite(year)) {
      setFormError("Ogiltigt belopp eller årsmodell");
      return;
    }
    try {
      await api.createVehicleCandidate({
        householdId,
        name: newName || `${newMake} ${newModel}`,
        make: newMake,
        model: newModel,
        modelYear: year,
        askPriceMinor: askMinor,
        estimatedMonthlyEconomicMinor: monthlyMinor,
      });
      await reload(householdId, vehicleId);
      setNewName("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Kunde inte skapa");
    }
  }

  async function handleArchive(candidateId: string) {
    if (!householdId) return;
    setFormError(null);
    try {
      await api.archiveVehicleCandidate(householdId, candidateId);
      await reload(householdId, vehicleId);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Kunde inte arkivera");
    }
  }

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

      {data.recommendation ? (
        <section className="rounded-[16px] border border-accent/20 bg-surface-elevated p-5">
          <h2 className="text-sm text-text-secondary">Rekommendation</h2>
          <p className="mt-2 font-medium">{data.recommendation.kind}</p>
          <p className="mt-2 text-sm text-text-secondary">
            {data.recommendation.financialReason}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {data.recommendation.householdFit}
          </p>
        </section>
      ) : null}

      {showSnapshot && data.analytics ? (
        <section className="rounded-[16px] bg-surface-elevated p-5">
          <h2 className="text-sm text-text-secondary">Marknadsanalys</h2>
          <p className="mt-1 text-xs text-text-muted">{askLabel}</p>
          {data.analytics.stats ? (
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-text-secondary">Lägsta utropspris (Q1)</dt>
                <dd>
                  <MoneyValue value={data.analytics.stats.lowerQuartile!} />
                </dd>
              </div>
              <div>
                <dt className="text-text-secondary">Median utropspris</dt>
                <dd>
                  <MoneyValue value={data.analytics.stats.medianAskingPrice!} />
                </dd>
              </div>
              <div>
                <dt className="text-text-secondary">Högsta utropspris (Q3)</dt>
                <dd>
                  <MoneyValue value={data.analytics.stats.upperQuartile!} />
                </dd>
              </div>
            </dl>
          ) : null}
          <p className="mt-3 text-xs text-text-muted">
            Jämförbara: {data.analytics.comparableCount} · nivå{" "}
            {data.analytics.selectionLevel}
          </p>
        </section>
      ) : null}

      {showSnapshot && data.analytics?.valuation ? (
        <section className="rounded-[16px] bg-surface-elevated p-5">
          <h2 className="text-sm text-text-secondary">Värderingsintervall</h2>
          <p className="mt-1 text-xs text-text-muted">
            {data.analytics.valuation.askLabel}
          </p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-text-secondary">Låg</dt>
              <dd>
                <MoneyValue value={data.analytics.valuation.estimatedLow!} />
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">Mid</dt>
              <dd>
                <MoneyValue value={data.analytics.valuation.estimatedMid!} />
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">Hög</dt>
              <dd>
                <MoneyValue value={data.analytics.valuation.estimatedHigh!} />
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {showSnapshot && data.analytics?.trend ? (
        <section className="rounded-[16px] bg-surface-elevated p-5">
          <h2 className="text-sm text-text-secondary">Trend (utropspris)</h2>
          <dl className="mt-4 grid gap-3 text-sm grid-cols-2 sm:grid-cols-4">
            {(["d30", "d90", "m6", "m12"] as const).map((key) => {
              const row = data.analytics!.trend![key];
              return (
                <div key={key}>
                  <dt className="text-text-secondary uppercase">{key}</dt>
                  <dd>
                    {row?.medianAskingChange ? (
                      <MoneyValue value={row.medianAskingChange} signed />
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ) : null}

      {showSnapshot && data.analytics?.liquidity ? (
        <section className="rounded-[16px] bg-surface-elevated p-5">
          <h2 className="text-sm text-text-secondary">Marknadsaktivitet</h2>
          <p className="mt-2 font-medium capitalize">
            {data.analytics.liquidity.label} (
            {(data.analytics.liquidity.score * 100).toFixed(0)} %)
          </p>
          <p className="mt-2 text-xs text-text-muted">
            {data.analytics.liquidity.caveats[0]}
          </p>
        </section>
      ) : null}

      {data.lease ? (
        <section className="rounded-[16px] bg-surface-elevated p-5">
          <h2 className="text-sm text-text-secondary">Privatleasing</h2>
          <p className="mt-2 font-medium">{data.lease.name}</p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-text-secondary">Normaliserad / mån</dt>
              <dd>
                <MoneyValue value={data.lease.monthlyNormalizedCash} />
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">Total förväntad kostnad</dt>
              <dd>
                <MoneyValue value={data.lease.totalExpectedLeaseCash} />
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {showCandidates ? (
        <section className="space-y-3">
          <h2 className="text-sm text-text-secondary">Kandidater</h2>
          {focus === "candidates" ? (
            <form
              onSubmit={(e) => void handleCreateCandidate(e)}
              className="rounded-[16px] bg-surface-elevated p-5 space-y-3"
            >
              <p className="text-sm font-medium">Ny kandidat</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  Namn
                  <input
                    className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Volvo XC60"
                  />
                </label>
                <label className="text-sm">
                  Utropspris (kr)
                  <input
                    className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2"
                    value={newAsk}
                    onChange={(e) => setNewAsk(e.target.value)}
                    inputMode="numeric"
                  />
                </label>
                <label className="text-sm">
                  Märke
                  <input
                    className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2"
                    value={newMake}
                    onChange={(e) => setNewMake(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Modell
                  <input
                    className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2"
                    value={newModel}
                    onChange={(e) => setNewModel(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Årsmodell
                  <input
                    className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2"
                    value={newYear}
                    onChange={(e) => setNewYear(e.target.value)}
                    inputMode="numeric"
                  />
                </label>
                <label className="text-sm">
                  Ekonomisk / mån (kr)
                  <input
                    className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2"
                    value={newMonthly}
                    onChange={(e) => setNewMonthly(e.target.value)}
                    inputMode="numeric"
                  />
                </label>
              </div>
              {formError ? (
                <p className="text-sm text-danger">{formError}</p>
              ) : null}
              <button
                type="submit"
                className="rounded-md bg-accent px-4 py-2 text-sm text-on-accent"
              >
                Skapa kandidat
              </button>
            </form>
          ) : null}
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
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="mt-1 text-xs text-text-muted">
                      {c.make} {c.model} {c.modelYear}
                      {c.notes ? ` · ${c.notes}` : ""}
                    </p>
                    {c.fit ? (
                      <p
                        className={`mt-2 text-xs ${c.fit.mustHaveFailures.length ? "text-warning" : "text-text-secondary"}`}
                      >
                        {c.fit.summary}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-left text-sm sm:text-right">
                    <MoneyValue value={c.askPrice} />
                    <p className="mt-1 text-xs text-text-secondary">
                      <MoneyValue value={c.estimatedMonthlyEconomic} /> / mån
                    </p>
                    {focus === "candidates" ? (
                      <button
                        type="button"
                        className="mt-2 text-xs text-danger hover:underline"
                        onClick={() => void handleArchive(c.id)}
                      >
                        Arkivera
                      </button>
                    ) : null}
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
            <div className="flex flex-col gap-3">
              {data.comparisons.map((c) => (
                <article
                  key={c.id}
                  className="rounded-[16px] bg-surface-elevated p-5 w-full"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                    <div>
                      <p className="font-medium">{c.title}</p>
                      <p className="mt-2 text-sm text-text-secondary">
                        {c.summary}
                      </p>
                    </div>
                    <div className="text-left text-sm sm:text-right">
                      <p className="uppercase tracking-wide text-text-muted">
                        {c.recommendation}
                        {c.fitEligible === false ? " · fit nekad" : ""}
                      </p>
                      <MoneyValue value={c.monthlyDelta} signed />
                      {c.horizonDelta ? (
                        <p className="mt-1 text-xs text-text-muted">
                          horizon: <MoneyValue value={c.horizonDelta} signed />
                        </p>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
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
          {data.purchaseWindow && !data.purchaseWindow.insufficientData ? (
            <p className="mt-3 text-sm text-text-secondary">
              {data.purchaseWindow.summary}
            </p>
          ) : null}
          {data.acquisitionComparison ? (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-text-secondary">Förvärvsläge</p>
              {data.acquisitionComparison.rows.map((r) => (
                <div
                  key={r.mode}
                  className="flex justify-between gap-3 text-sm border-t border-border pt-2"
                >
                  <span>{r.mode}</span>
                  <MoneyValue value={r.totalEconomicCost} />
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
