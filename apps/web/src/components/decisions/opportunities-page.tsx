"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { OpportunitiesResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function OpportunitiesPage() {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [data, setData] = useState<OpportunitiesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const id = await ensureHouseholdSession();
      setHouseholdId(id);
      const opps = await api.getOpportunities(id);
      setData(opps);
      for (const item of opps.items.slice(0, 3)) {
        void api.trackRecommendationOutcome({
          householdId: id,
          recommendationKey: `opp:${item.id}`,
          title: item.title,
          expectedImpactMinor: item.estimatedAnnualSaving?.amountMinor ?? null,
          status: "SHOWN",
          notes: "Tracked when shown on opportunities page",
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Något gick fel");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState label="Hämtar opportunities…" />;
  if (error) {
    return (
      <ErrorState
        title="Kunde inte hämta opportunities"
        description={error}
        onRetry={() => void load()}
      />
    );
  }
  if (!data) {
    return (
      <EmptyState
        title="Inga opportunities"
        description="Live-detektorer körs när hushållsdata finns."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Opportunities
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Live-detektorer · {data.source ?? "live-engine"} · as of {data.asOf}
        </p>
        <p className="mt-2 text-sm">
          <Link href="/advisor" className="text-accent hover:underline">
            Recommendation outcomes →
          </Link>
        </p>
      </div>

      {data.lifestyleCreep ? (
        <section className="rounded-[16px] bg-surface-elevated p-5">
          <h2 className="text-sm text-text-secondary">Lifestyle creep</h2>
          <p className="mt-2 text-sm text-text-primary">
            {data.lifestyleCreep.creeping
              ? "Utgifterna har stigit mot baseline."
              : "Ingen tydlig lifestyle creep just nu."}
          </p>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-3">
            <div>
              <dt className="text-text-secondary">Senaste 3 mån snitt</dt>
              <dd>
                <MoneyValue value={data.lifestyleCreep.recentAvgMonthly} />
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">Baseline 12 mån</dt>
              <dd>
                <MoneyValue value={data.lifestyleCreep.baselineAvgMonthly} />
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">Delta</dt>
              <dd>
                <MoneyValue value={data.lifestyleCreep.delta} signed />
                {data.lifestyleCreep.deltaPercent != null
                  ? ` (${data.lifestyleCreep.deltaPercent.toFixed(1)} %)`
                  : ""}
              </dd>
            </div>
          </dl>
          {data.lifestyleCreep.drivers.length > 0 ? (
            <ul className="mt-4 space-y-2 text-sm">
              {data.lifestyleCreep.drivers.map((d) => (
                <li key={d.categoryKey} className="flex justify-between gap-3">
                  <Link href={d.href} className="text-accent hover:underline">
                    {d.categoryName}
                  </Link>
                  <MoneyValue value={d.delta} signed />
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {data.items.length === 0 ? (
        <EmptyState
          title="Inga aktiva opportunities"
          description="Detektorerna hittade inget över tröskelvärdena."
        />
      ) : (
        <ul className="space-y-3">
          {data.items.map((item) => (
            <li key={item.id} className="rounded-[16px] bg-surface-elevated p-5">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-2 text-sm text-text-secondary">
                    {item.description}
                  </p>
                  <p className="mt-2 text-xs text-text-muted">
                    {item.status} · {item.effort} effort · prio {item.priority}
                    {item.detectorKey ? ` · ${item.detectorKey}` : ""}
                  </p>
                  {(item.evidence ?? []).length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-3 text-xs">
                      {(item.evidence ?? []).map((e) => (
                        <Link
                          key={`${e.kind}-${e.id}-${e.href}`}
                          href={e.href}
                          className="text-accent hover:underline"
                          onClick={() => {
                            if (!householdId) return;
                            void api.trackRecommendationOutcome({
                              householdId,
                              recommendationKey: `opp:${item.id}`,
                              title: item.title,
                              status: "OPENED",
                              notes: `Opened evidence ${e.label}`,
                            });
                          }}
                        >
                          {e.label} →
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
                {item.estimatedAnnualSaving ? (
                  <div className="text-right text-sm">
                    <MoneyValue value={item.estimatedAnnualSaving} />
                    <p className="text-xs text-text-secondary">/ år</p>
                    {item.estimateBasis ? (
                      <p className="mt-1 max-w-[12rem] text-[11px] text-text-muted">
                        {item.estimateBasis}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
