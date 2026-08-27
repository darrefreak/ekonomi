"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type {
  DecisionAction,
  DecisionActionCategory,
  DecisionsCenterResponse,
} from "@ffos/schemas";
import { api } from "@/lib/api";
import { describeError } from "@/lib/error-message";
import { queryKeys } from "@/lib/query-keys";
import { useHouseholdId } from "@/lib/use-household-id";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

const TONE_STYLES: Record<DecisionAction["tone"], string> = {
  critical: "border-negative/40 bg-negative/5",
  warning: "border-warning/40 bg-warning/5",
  opportunity: "border-accent/40 bg-accent/5",
  positive: "border-positive/40 bg-positive/5",
  info: "border-border bg-surface-elevated",
};

const HORIZON_SUFFIX: Record<NonNullable<DecisionAction["impactHorizon"]>, string> = {
  annual: "/år",
  monthly: "/mån",
  oneoff: "",
};

export function DecisionsPage() {
  const householdId = useHouseholdId();
  const [active, setActive] = useState<DecisionActionCategory | "ALL">("ALL");

  const query = useQuery({
    queryKey: householdId
      ? queryKeys.decisions.all(householdId)
      : ["decisions", "pending"],
    queryFn: () => api.getDecisions(householdId!),
    enabled: Boolean(householdId),
    staleTime: 60_000,
  });

  const data = query.data as DecisionsCenterResponse | undefined;

  const filtered = useMemo(() => {
    if (!data) return [];
    if (active === "ALL") return data.actions;
    return data.actions.filter((a) => a.category === active);
  }, [data, active]);

  if (!householdId || query.isLoading) {
    return <LoadingState label="Går igenom din ekonomi…" />;
  }
  if (query.isError) {
    return (
      <ErrorState
        title="Kunde inte hämta dina beslut"
        description={describeError(query.error, "Försök igen om en stund.")}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (!data) return null;

  const totalAnnual = BigInt(data.totalAnnualOpportunity.amountMinor);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Att göra
        </h1>
        <p className="mt-2 text-sm text-text-secondary">{data.headline}</p>
      </div>

      {totalAnnual > 0n ? (
        <section
          className="rounded-[18px] bg-surface-elevated p-5 shadow-[var(--ffos-shadow-soft)]"
          data-testid="decisions-total"
        >
          <p className="text-sm text-text-secondary">Att hämta om du agerar</p>
          <p className="mt-1 font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight tabular-nums">
            upp till <MoneyValue value={data.totalAnnualOpportunity} />/år
          </p>
          <p className="mt-2 text-xs text-text-muted">
            Summan av de möjligheter nedan som går att sätta en siffra på. Allt är
            beräknat ur din egen data — inget kommer från en språkmodell.
          </p>
        </section>
      ) : null}

      {data.coverageNote ? (
        <p className="rounded-[12px] border border-border bg-surface-elevated p-4 text-sm text-text-secondary">
          {data.coverageNote}{" "}
          <Link href="/lagg-till" className="font-medium text-accent">
            Lägg till mer →
          </Link>
        </p>
      ) : null}

      {data.categories.length > 1 ? (
        <div role="group" aria-label="Filtrera" className="flex flex-wrap gap-2">
          <FilterChip
            label={`Allt (${data.actions.length})`}
            active={active === "ALL"}
            onClick={() => setActive("ALL")}
          />
          {data.categories.map((c) => (
            <FilterChip
              key={c.key}
              label={`${c.label} (${c.count})`}
              active={active === c.key}
              onClick={() => setActive(c.key)}
            />
          ))}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          title="Inget brådskande just nu"
          description="Din ekonomi ser stabil ut. När något sticker ut dyker det upp här."
        />
      ) : (
        <ol className="space-y-3">
          {filtered.map((action, index) => (
            <li key={action.id}>
              <ActionCard action={action} rank={active === "ALL" ? index + 1 : null} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ActionCard({
  action,
  rank,
}: {
  action: DecisionAction;
  rank: number | null;
}) {
  return (
    <Link
      href={action.href}
      data-testid="decision-action"
      className={`block rounded-[16px] border p-5 transition hover:shadow-[var(--ffos-shadow-soft)] ${TONE_STYLES[action.tone]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {rank != null ? (
            <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-medium tabular-nums">
              {rank}
            </span>
          ) : null}
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-text-muted">
              {CATEGORY_LABEL(action.category)}
            </p>
            <h2 className="mt-0.5 font-medium text-text-primary">{action.title}</h2>
          </div>
        </div>
        {action.impact ? (
          <div className="shrink-0 text-right">
            <p className="font-medium tabular-nums text-text-primary">
              <MoneyValue value={action.impact} />
              {action.impactHorizon ? HORIZON_SUFFIX[action.impactHorizon] : ""}
            </p>
            {action.confidenceLabel ? (
              <p className="mt-0.5 text-[11px] text-text-muted">
                {CONFIDENCE_LABEL(action.confidenceLabel)}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-text-secondary">{action.detail}</p>
      <p className="mt-2 text-sm font-medium text-text-primary">
        {action.recommendation}
      </p>
    </Link>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-9 rounded-full px-3 text-sm ${
        active
          ? "bg-accent font-medium text-on-accent"
          : "border border-border bg-surface-elevated text-text-secondary hover:text-text-primary"
      }`}
    >
      {label}
    </button>
  );
}

function CATEGORY_LABEL(category: DecisionActionCategory): string {
  const map: Record<DecisionActionCategory, string> = {
    DEBT: "Skulder",
    SUBSCRIPTIONS: "Abonnemang",
    SPENDING: "Utgifter",
    LIQUIDITY: "Likviditet",
    SAVINGS: "Sparande",
    VEHICLE: "Fordon",
    INCOME: "Inkomst",
    BUDGET: "Budget",
    RISK: "Risk",
    OTHER: "Övrigt",
  };
  return map[category];
}

function CONFIDENCE_LABEL(label: "low" | "medium" | "high"): string {
  return label === "high"
    ? "hög säkerhet"
    : label === "medium"
      ? "medelsäker"
      : "låg säkerhet";
}
