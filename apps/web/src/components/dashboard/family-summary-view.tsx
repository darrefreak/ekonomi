"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { FamilySummaryResponse, FamilySummarySection } from "@ffos/schemas";
import { api } from "@/lib/api";
import { useHouseholdId } from "@/lib/use-household-id";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

/**
 * The family summary: the household's finances as three plain questions.
 *
 * Every number shown here is produced by the deterministic engines and served
 * by `/api/v1/family-summary`; this component only arranges and links them. It
 * is the primary home surface — position, forecast and the rest live below it
 * as detail, not as the first thing a family has to read.
 */

const STATUS_META: Record<
  FamilySummarySection["status"],
  { label: string; dot: string; ring: string }
> = {
  act: { label: "Behöver åtgärd", dot: "bg-negative", ring: "border-negative/30" },
  watch: { label: "Håll koll", dot: "bg-warning", ring: "border-warning/30" },
  good: { label: "Ser bra ut", dot: "bg-positive", ring: "border-positive/30" },
};

const TONE_CLASS: Record<FamilySummarySection["rows"][number]["tone"], string> = {
  positive: "text-positive",
  negative: "text-negative",
  neutral: "text-text-primary",
};

export function FamilySummaryView() {
  const householdId = useHouseholdId();
  const query = useQuery({
    queryKey: ["family-summary", householdId],
    queryFn: () => api.getFamilySummary(householdId!),
    enabled: Boolean(householdId),
    staleTime: 60_000,
  });

  if (!householdId || query.isLoading) {
    return <LoadingState label="Sammanställer er familjeöversikt…" />;
  }
  if (query.isError || !query.data) {
    return (
      <ErrorState
        title="Kunde inte hämta översikten"
        description="Dina sparade uppgifter påverkas inte. Försök igen om en stund."
        onRetry={() => void query.refetch()}
      />
    );
  }

  const data: FamilySummaryResponse = query.data;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-text-muted">{data.greeting}</p>
        <h1 className="mt-1 font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight text-text-primary md:text-4xl">
          {data.headline}
        </h1>
        {data.lowData ? (
          <p className="mt-2 rounded-[12px] border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-text-secondary">
            Det finns ännu lite historik, så vissa bedömningar är preliminära.
            Importera fler månader för en säkrare bild.
          </p>
        ) : null}
      </header>

      {data.narrative.length > 0 ? (
        <section className="rounded-[18px] bg-surface-elevated p-5 shadow-[var(--ffos-shadow-soft)]">
          <ul className="space-y-2">
            {data.narrative.map((sentence, index) => (
              <li key={index} className="flex gap-2 text-sm text-text-secondary">
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/60" />
                <span className="text-text-primary">{sentence}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-text-muted">{data.aiStatus.message}</p>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard section={data.sections.waste} />
        <SectionCard section={data.sections.saving} />
        <SectionCard section={data.sections.action} />
      </div>
    </div>
  );
}

function SectionCard({ section }: { section: FamilySummarySection }) {
  const status = STATUS_META[section.status];
  return (
    <section
      className={`flex flex-col rounded-[18px] border ${status.ring} bg-surface-elevated p-5 shadow-[var(--ffos-shadow-soft)]`}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-text-secondary">{section.title}</h2>
        <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
          <span aria-hidden className={`h-2 w-2 rounded-full ${status.dot}`} />
          {status.label}
        </span>
      </div>

      {section.metricValue ? (
        <p className="mt-3">
          <span className="block text-xs text-text-muted">{section.metricLabel}</span>
          <span className="mt-0.5 block text-2xl font-medium tabular-nums text-text-primary">
            {section.metricValue}
          </span>
        </p>
      ) : null}

      <p className="mt-3 text-sm text-text-primary">{section.summary}</p>

      {section.rows.length > 0 ? (
        <ul className="mt-3 divide-y divide-border">
          {section.rows.map((row, index) => (
            <li key={`${row.label}-${index}`}>
              <Link
                href={row.href}
                className="flex min-h-11 items-center justify-between gap-3 text-sm hover:text-accent"
              >
                <span className="min-w-0 flex-1 truncate text-text-secondary">
                  {row.label}
                </span>
                {row.amountText ? (
                  <span className={`shrink-0 tabular-nums ${TONE_CLASS[row.tone]}`}>
                    {row.amountText}
                  </span>
                ) : (
                  <span aria-hidden className="shrink-0 text-text-muted">
                    →
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {section.benchmark ? (
        <p className="mt-3 text-xs text-text-muted">{section.benchmark}</p>
      ) : null}

      {section.ctaLabel && section.ctaHref ? (
        <Link
          href={section.ctaHref}
          className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-accent"
        >
          {section.ctaLabel} →
        </Link>
      ) : null}
    </section>
  );
}
