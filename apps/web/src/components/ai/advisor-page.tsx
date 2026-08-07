"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type {
  AdvisorBriefResponse,
  RecommendationOutcomesResponse,
} from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function AdvisorPage() {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [data, setData] = useState<AdvisorBriefResponse | null>(null);
  const [outcomes, setOutcomes] =
    useState<RecommendationOutcomesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const id = await ensureHouseholdSession();
      setHouseholdId(id);
      const [brief, outs] = await Promise.all([
        api.getAdvisorBrief(id),
        api.getRecommendationOutcomes(id),
      ]);
      setData(brief);
      setOutcomes(outs);
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

  async function setStatus(
    outcomeId: string,
    status: "ACCEPTED" | "DISMISSED" | "COMPLETED" | "OPENED",
  ) {
    if (!householdId) return;
    setBusyId(outcomeId);
    try {
      const next = await api.updateRecommendationOutcome(outcomeId, {
        householdId,
        status,
      });
      setOutcomes(next);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingState label="Hämtar AI-brief…" />;
  if (error || !data) {
    return (
      <ErrorState
        title="Kunde inte hämta advisor"
        description={error ?? ""}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          AI-rådgivare
        </h1>
        <p className="mt-2 text-sm text-text-secondary">{data.headline}</p>
        <p className="mt-2 text-xs text-text-muted">{data.disclaimer}</p>
        <p className="mt-3 text-sm">
          <Link href="/opportunities" className="text-accent hover:underline">
            Opportunities →
          </Link>
          {" · "}
          <Link href="/risk" className="text-accent hover:underline">
            Risk →
          </Link>
        </p>
      </div>

      <ul className="space-y-3">
        {data.sections.map((s) => (
          <li key={s.title} className="rounded-[16px] bg-surface-elevated p-5">
            <p className="font-medium">{s.title}</p>
            <p className="mt-2 text-sm text-text-secondary">{s.detail}</p>
            <p className="mt-3 text-xs text-text-muted">
              Källverktyg: {s.sourceTools.join(", ")}
            </p>
          </li>
        ))}
      </ul>

      <section className="rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm text-text-secondary">Tool trace (explainability)</h2>
        <ul className="mt-3 space-y-2 text-xs text-text-muted">
          {data.toolTrace.map((t) => (
            <li key={t.tool}>
              {t.ok ? "✓" : "✗"} {t.tool}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm text-text-secondary">Recommendation outcomes</h2>
        {!outcomes?.items.length ? (
          <EmptyState
            title="Inga outcomes ännu"
            description="När opportunities visas spåras de här."
          />
        ) : (
          outcomes.items.map((o) => (
            <article
              key={o.id}
              className="rounded-[16px] bg-surface-elevated p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{o.title}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {o.recommendationKey} · {o.status} ·{" "}
                    {new Date(o.shownAt).toLocaleString("sv-SE")}
                  </p>
                  {o.expectedImpact ? (
                    <p className="mt-2 text-sm">
                      Förväntad effekt: <MoneyValue value={o.expectedImpact} />
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  {(
                    [
                      ["ACCEPTED", "Acceptera"],
                      ["DISMISSED", "Avfärda"],
                      ["COMPLETED", "Klar"],
                    ] as const
                  ).map(([status, label]) => (
                    <button
                      key={status}
                      type="button"
                      disabled={busyId === o.id || o.status === status}
                      onClick={() => void setStatus(o.id, status)}
                      className="min-h-11 px-3 text-accent disabled:opacity-40"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
