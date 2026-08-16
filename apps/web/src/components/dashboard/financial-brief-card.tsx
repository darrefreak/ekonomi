"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { BriefItem, FindingSeverity } from "@ffos/schemas";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useHouseholdId } from "@/lib/use-household-id";

/**
 * Financial Brief V2 (§36, §41, §49–§50).
 *
 * Renders the ranked deterministic findings: headline plus 3–5 items, each
 * with a "Varför ser jag detta?" link into the supporting page. The card owns
 * its own loading/error states: a brief that cannot be fetched degrades to a
 * quiet notice — never to an implied "your finances are broken".
 */

const SEVERITY_DOT: Record<FindingSeverity, string> = {
  CRITICAL: "bg-warning",
  WARNING: "bg-warning/70",
  NOTICE: "bg-accent/60",
  POSITIVE: "bg-positive",
};

export function FinancialBriefCard() {
  const householdId = useHouseholdId();

  const briefQuery = useQuery({
    queryKey: householdId ? queryKeys.brief.all(householdId) : ["brief", "pending"],
    queryFn: () => api.getFinancialBrief(householdId!),
    enabled: Boolean(householdId),
    staleTime: 60_000,
  });

  return (
    <section
      className="rounded-[18px] bg-surface-elevated p-5 shadow-[var(--ffos-shadow-soft)]"
      data-testid="financial-brief-card"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-text-secondary">Finansiell brief</h2>
        {briefQuery.data ? (
          <span className="text-xs text-text-muted">per {briefQuery.data.asOf}</span>
        ) : null}
      </div>

      {briefQuery.isLoading || !householdId ? (
        <p className="mt-2 text-sm text-text-muted">Hämtar din brief…</p>
      ) : briefQuery.isError ? (
        <div className="mt-2">
          <p className="text-sm text-text-secondary">
            Briefen kunde inte hämtas just nu. Din ekonomiska analys påverkas inte.
          </p>
          <button
            type="button"
            className="mt-2 min-h-11 rounded-[12px] border border-border px-4 text-sm"
            onClick={() => void briefQuery.refetch()}
          >
            Försök igen
          </button>
        </div>
      ) : briefQuery.data ? (
        <>
          <p className="mt-2 text-base text-text-primary" data-testid="brief-headline">
            {briefQuery.data.headline}
          </p>
          {briefQuery.data.items.length === 0 ? (
            <p className="mt-4 text-sm text-text-muted">Inga briefpunkter just nu.</p>
          ) : (
            <ol className="mt-4 space-y-3" data-testid="brief-items">
              {briefQuery.data.items.map((item, index) => (
                <BriefItemRow key={item.findingKey} item={item} index={index} />
              ))}
            </ol>
          )}
          <p className="mt-4 text-xs text-text-muted" data-testid="brief-ai-status">
            {briefQuery.data.aiStatus.message}
          </p>
        </>
      ) : null}
    </section>
  );
}

function BriefItemRow({ item, index }: { item: BriefItem; index: number }) {
  return (
    <li className="text-sm">
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[item.severity]}`}
        />
        <div className="min-w-0">
          <p className="text-text-primary">
            <span className="font-medium">{index + 1}.</span> {item.text}
          </p>
          <Link
            href={item.explainRoute}
            aria-label={`Förklaring: ${item.explainLabel || item.text}`}
            className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-accent"
          >
            Varför ser jag detta? · {item.explainLabel} →
          </Link>
        </div>
      </div>
    </li>
  );
}
