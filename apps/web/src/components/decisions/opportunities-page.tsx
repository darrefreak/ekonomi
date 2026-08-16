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
import { describeError } from "@/lib/error-message";

type OpportunityItem = OpportunitiesResponse["items"][number];

const CONFIDENCE_LABEL_SV: Record<string, string> = {
  low: "Låg säkerhet",
  medium: "Medel säkerhet",
  high: "Hög säkerhet",
};

const EFFORT_LABEL_SV: Record<string, string> = {
  low: "Låg insats",
  medium: "Medel insats",
  high: "Hög insats",
};

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "accent" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
        tone === "accent"
          ? "bg-accent/10 text-accent"
          : "bg-surface-muted text-text-secondary"
      }`}
    >
      {children}
    </span>
  );
}

function freshnessLabel(item: OpportunityItem): string | null {
  if (!item.lastCalculatedAt) return null;
  const calculated = new Date(item.lastCalculatedAt);
  if (Number.isNaN(calculated.getTime())) return null;
  const days = Math.floor((Date.now() - calculated.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Beräknad idag";
  if (days === 1) return "Beräknad igår";
  return `Beräknad ${days} dagar sedan`;
}

function OpportunityCard({
  item,
  householdId,
}: {
  item: OpportunityItem;
  householdId: string | null;
}) {
  const confidenceLabel = item.confidenceLabel
    ? CONFIDENCE_LABEL_SV[item.confidenceLabel] ?? item.confidenceLabel
    : null;
  const effortLabel = EFFORT_LABEL_SV[item.effort] ?? item.effort;
  const facts = item.facts ?? [];
  const fresh = freshnessLabel(item);

  return (
    <li className="rounded-[16px] bg-surface-elevated p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{item.title}</p>
          <p className="mt-2 text-sm text-text-secondary">{item.description}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {confidenceLabel ? <Badge>{confidenceLabel}</Badge> : null}
            <Badge>{effortLabel}</Badge>
          </div>

          {facts.length > 0 ? (
            <details className="mt-3 text-xs text-text-secondary">
              <summary className="flex min-h-11 cursor-pointer select-none items-center text-accent">
                Varför? ({facts.length})
              </summary>
              <dl className="mt-2 space-y-1.5 border-l border-surface-muted pl-3">
                {facts.map((f) => (
                  <div key={f.key} className="flex flex-wrap justify-between gap-2">
                    <dt className="text-text-muted">{f.label}</dt>
                    <dd className="tabular-nums">{f.value}</dd>
                  </div>
                ))}
              </dl>
              {item.assumptions.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-text-muted">
                  {item.assumptions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              ) : null}
            </details>
          ) : null}

          {(item.evidence ?? []).length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              {(item.evidence ?? []).map((e) => (
                <Link
                  key={`${e.kind}-${e.id}-${e.href}`}
                  href={e.href}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center text-accent hover:underline"
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
          <div className="text-left sm:min-w-[9rem] sm:text-right">
            <p className="text-[11px] uppercase tracking-wide text-text-muted">ca</p>
            <p className="text-lg font-semibold tabular-nums">
              <MoneyValue value={item.estimatedAnnualSaving} />
            </p>
            <p className="text-xs text-text-secondary">/ år</p>
            {item.estimatedMonthlyImpact ? (
              <p className="mt-1 text-xs text-text-muted">
                ca <MoneyValue value={item.estimatedMonthlyImpact} /> / mån
              </p>
            ) : null}
            {item.estimateBasis ? (
              <p className="mt-1 max-w-[12rem] text-[11px] text-text-muted sm:ml-auto">
                {item.estimateBasis}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {fresh ? (
        <p className="mt-3 text-[11px] text-text-muted">{fresh}</p>
      ) : null}
    </li>
  );
}

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
      setError(describeError(err, "Något gick fel"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState label="Hämtar möjligheter…" />;
  if (error) {
    return (
      <ErrorState
        title="Kunde inte hämta möjligheter"
        description={error}
        onRetry={() => void load()}
      />
    );
  }
  if (!data) {
    return (
      <EmptyState
        title="Inga möjligheter ännu"
        description="När det finns tillräckligt med historik visas konkreta förbättringsförslag här."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Möjligheter
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Förslag baserade på hushållets mönster · beräknat per {data.asOf}
        </p>
        <p className="mt-2 text-sm">
          <Link
            href="/advisor"
            className="inline-flex min-h-11 items-center text-accent hover:underline"
          >
            Se tidigare rekommendationer →
          </Link>
        </p>
      </div>

      {data.lifestyleCreep ? (
        <section className="rounded-[16px] bg-surface-elevated p-5">
          <h2 className="text-sm text-text-secondary">
            Ökar utgifterna över tid?
          </h2>
          <p className="mt-2 text-sm text-text-primary">
            {data.lifestyleCreep.creeping
              ? "Utgifterna har stigit jämfört med hushållets normalnivå."
              : "Ingen tydlig långsiktig utgiftsökning just nu."}
          </p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-text-secondary">Senaste 3 mån snitt</dt>
              <dd>
                <MoneyValue value={data.lifestyleCreep.recentAvgMonthly} />
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">Normalnivå 12 mån</dt>
              <dd>
                <MoneyValue value={data.lifestyleCreep.baselineAvgMonthly} />
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">Förändring</dt>
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
                <li key={d.categoryKey} className="flex flex-wrap justify-between gap-3">
                  <Link
                    href={d.href}
                    className="inline-flex min-h-11 items-center text-accent hover:underline"
                  >
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
          title="Inga aktiva möjligheter"
          description="Inget kräver en rekommendation just nu."
        />
      ) : (
        <ul className="space-y-3">
          {data.items.map((item) => (
            <OpportunityCard key={item.id} item={item} householdId={householdId} />
          ))}
        </ul>
      )}
    </div>
  );
}
