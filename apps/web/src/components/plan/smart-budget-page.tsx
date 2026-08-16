"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SmartBudgetGroup, SmartBudgetResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { describeError } from "@/lib/error-message";
import { kronorToMinorString, minorToKronorInput } from "@/lib/money-input";
import { queryKeys } from "@/lib/query-keys";
import { useHouseholdId } from "@/lib/use-household-id";
import { MoneyValue } from "../financial/money-value";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { EmptyState } from "../feedback/empty-state";
import { BudgetPage } from "../money/budget-page";

/**
 * Smart Budget — the default budgeting experience.
 *
 * Six groups instead of fifty categories. Every suggestion is deterministic
 * and explains itself ("Varför detta belopp?"). Adopting the plan stores the
 * chosen amounts for the month; the suggestion itself is always recomputed
 * from history. The old category-level budget stays available as
 * "Detaljerad budget" for those who want it — smart defaults first, power
 * second.
 */

function kr(minor: string | null, currency: string, signed = false) {
  if (minor === null) return <span className="text-text-muted">–</span>;
  return (
    <MoneyValue value={{ amountMinor: minor, currency: currency as "SEK" }} signed={signed} />
  );
}

export function SmartBudgetPage() {
  const [mode, setMode] = useState<"smart" | "detailed">("smart");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
            Budget
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            {mode === "smart"
              ? "Ett förslag räknat ur din egen historik — sex grupper i stället för femtio kategorier."
              : "Detaljerad budget per kategori, för dig som vill styra varje rad."}
          </p>
        </div>
        <div role="group" aria-label="Budgetläge" className="flex rounded-[10px] bg-surface-elevated p-0.5">
          <button
            type="button"
            onClick={() => setMode("smart")}
            aria-pressed={mode === "smart"}
            className={`min-h-11 rounded-[8px] px-3 text-sm ${
              mode === "smart"
                ? "bg-surface font-medium text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            Smart budget
          </button>
          <button
            type="button"
            onClick={() => setMode("detailed")}
            aria-pressed={mode === "detailed"}
            className={`min-h-11 rounded-[8px] px-3 text-sm ${
              mode === "detailed"
                ? "bg-surface font-medium text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            Detaljerad
          </button>
        </div>
      </div>

      {mode === "smart" ? <SmartBudgetView /> : <BudgetPage embedded />}
    </div>
  );
}

function SmartBudgetView() {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: queryKeys.smartBudget.month(householdId ?? ""),
    queryFn: () => api.getSmartBudget(householdId!),
    enabled: Boolean(householdId),
  });

  const adopt = useMutation({
    mutationFn: async (data: SmartBudgetResponse) => {
      const lines = data.groups.map((group) => {
        const draft = drafts[group.key];
        const minor =
          draft !== undefined
            ? kronorToMinorString(draft)
            : (group.plannedMinor ?? group.suggestedMinor);
        if (minor == null || BigInt(minor) < 0n) {
          throw new Error(`Ange ett giltigt belopp för ${group.name}.`);
        }
        return { key: group.key, plannedMinor: minor };
      });
      return api.adoptSmartBudget({ householdId: householdId!, month: data.month, lines });
    },
    onSuccess: (next) => {
      queryClient.setQueryData(queryKeys.smartBudget.month(householdId ?? ""), next);
      setDrafts({});
      setActionError(null);
    },
    onError: (err) => {
      setActionError(describeError(err, "Budgeten kunde inte sparas. Ditt förslag finns kvar."));
    },
  });

  const data = query.data as SmartBudgetResponse | undefined;

  const totals = useMemo(() => {
    if (!data) return null;
    let suggested = 0n;
    let planned = 0n;
    let anyPlanned = false;
    for (const group of data.groups) {
      suggested += BigInt(group.suggestedMinor);
      if (group.plannedMinor !== null) {
        planned += BigInt(group.plannedMinor);
        anyPlanned = true;
      }
    }
    return {
      suggestedMinor: suggested.toString(),
      plannedMinor: anyPlanned ? planned.toString() : null,
    };
  }, [data]);

  if (!householdId || query.isLoading) {
    return <LoadingState label="Räknar fram ett budgetförslag ur din historik…" />;
  }
  if (query.isError) {
    return (
      <ErrorState
        title="Budgetförslaget kunde inte hämtas"
        description={describeError(query.error, "Försök igen om en stund.")}
      />
    );
  }
  if (!data) return null;

  if (data.monthsOfHistory < 2) {
    return (
      <EmptyState
        title="För lite historik för ett förslag"
        description="Smart budget räknas ut från dina egna månader. Importera minst ett par månaders kontoutdrag så föreslår vi en budget."
      />
    );
  }

  const monthLabel = new Date(`${data.month}-01T00:00:00`)
    .toLocaleDateString("sv-SE", { month: "long", year: "numeric" })
    .replace(/^./, (c) => c.toUpperCase());

  return (
    <div className="space-y-6">
      {/* The flex number: the one number to remember. */}
      <section className="rounded-[16px] bg-surface-elevated p-5">
        <p className="text-xs text-text-muted">Kvar att använda · {monthLabel}</p>
        <p className="mt-1 font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight tabular-nums">
          {kr(
            data.flex.remainingMinor ?? data.flex.plannedMinor ?? data.flex.suggestedMinor,
            data.currency,
          )}
        </p>
        <p className="mt-2 text-sm text-text-secondary">
          Ditt flexibla utrymme efter nödvändiga kostnader, ojämna utgifter, mål och
          planerat sparande. Det är inte ditt kontosaldo.
        </p>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer select-none text-accent">Så räknade vi</summary>
          <ul className="mt-2 space-y-1 text-xs text-text-secondary">
            {data.flex.explanation.map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>
        </details>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          Förslag för {monthLabel} · förväntad inkomst{" "}
          <span className="font-medium tabular-nums text-text-primary">
            {kr(data.expectedIncomeMinor, data.currency)}
          </span>
          {totals ? (
            <>
              {" "}
              · föreslagen totalram{" "}
              <span className="font-medium tabular-nums text-text-primary">
                {kr(totals.suggestedMinor, data.currency)}
              </span>
            </>
          ) : null}
        </p>
        <button
          type="button"
          onClick={() => adopt.mutate(data)}
          disabled={adopt.isPending}
          className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-on-accent disabled:opacity-60"
        >
          {adopt.isPending
            ? "Sparar…"
            : data.adopted
              ? "Uppdatera planen"
              : "Anta förslaget"}
        </button>
      </div>
      {data.adopted && data.adoptedAt ? (
        <p className="text-xs text-text-muted">
          Planen för {monthLabel.toLowerCase()} antogs {data.adoptedAt.slice(0, 10)}. Du kan
          ändra beloppen och spara igen när du vill.
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="text-sm text-negative">
          {actionError}
        </p>
      ) : null}

      <ul className="space-y-4">
        {data.groups.map((group) => (
          <li key={group.key}>
            <GroupCard
              group={group}
              currency={data.currency}
              draft={drafts[group.key]}
              onDraft={(value) =>
                setDrafts((prev) => ({ ...prev, [group.key]: value }))
              }
            />
          </li>
        ))}
      </ul>

      <p className="text-xs text-text-muted">
        Alla belopp är deterministiskt beräknade ur din egen historik (upp till 24
        månader): medianer, senaste tre månaderna och säsongsjustering. Inget belopp
        kommer från en språkmodell.
      </p>
    </div>
  );
}

function GroupCard({
  group,
  currency,
  draft,
  onDraft,
}: {
  group: SmartBudgetGroup;
  currency: string;
  draft: string | undefined;
  onDraft: (value: string) => void;
}) {
  const planned = group.plannedMinor ?? group.suggestedMinor;
  const forecastOver =
    group.plannedMinor !== null && BigInt(group.forecastMinor) > BigInt(group.plannedMinor);
  const diffMinor = (BigInt(group.forecastMinor) - BigInt(planned)).toString();
  const inputId = `smart-budget-${group.key}`;

  return (
    <section className="rounded-[16px] bg-surface-elevated p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text-primary">{group.name}</h2>
          <p className="mt-0.5 text-xs text-text-muted">{group.description}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-text-muted">Förslag</p>
          <p className="text-lg font-medium tabular-nums">
            {kr(group.suggestedMinor, currency)}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3 text-sm">
        <div>
          <dt className="text-xs text-text-muted">Betalt hittills</dt>
          <dd className="mt-0.5 tabular-nums">{kr(group.actualMinor, currency)}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Prognos månadsslut</dt>
          <dd className={`mt-0.5 tabular-nums ${forecastOver ? "text-warning" : ""}`}>
            {kr(group.forecastMinor, currency)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Trolig avvikelse</dt>
          <dd
            className={`mt-0.5 tabular-nums ${BigInt(diffMinor) > 0n ? "text-warning" : "text-positive"}`}
          >
            {kr(diffMinor, currency, true)}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex items-center gap-2">
        <label htmlFor={inputId} className="text-xs text-text-muted">
          Din ram (kr)
        </label>
        <input
          id={inputId}
          inputMode="decimal"
          value={draft ?? minorToKronorInput(planned)}
          onChange={(event) => onDraft(event.target.value)}
          className="w-28 rounded-[8px] border border-border bg-surface px-2 py-1.5 text-right text-sm tabular-nums"
        />
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer select-none text-accent">
          Varför detta belopp?
        </summary>
        <div className="mt-2 space-y-2">
          <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-text-muted">Median (upp till 24 mån)</dt>
              <dd className="mt-0.5 tabular-nums">{kr(group.basis.median12Minor, currency)}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Senaste 3 mån</dt>
              <dd className="mt-0.5 tabular-nums">{kr(group.basis.latest3Minor, currency)}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Säsongsjustering</dt>
              <dd className="mt-0.5 tabular-nums">
                {group.basis.seasonalFactor === null
                  ? "–"
                  : `${group.basis.seasonalFactor >= 1 ? "+" : ""}${((group.basis.seasonalFactor - 1) * 100)
                      .toFixed(0)
                      .replace(".", ",")} %`}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Månader observerade</dt>
              <dd className="mt-0.5 tabular-nums">{group.basis.monthsObserved}</dd>
            </div>
          </dl>
          {group.basis.notes.length > 0 ? (
            <ul className="space-y-1 text-xs text-text-secondary">
              {group.basis.notes.map((note) => (
                <li key={note}>· {note}</li>
              ))}
            </ul>
          ) : null}
          {group.contributors.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-text-secondary">Största posterna</p>
              <ul className="mt-1 divide-y divide-border">
                {group.contributors.map((contributor) => (
                  <li
                    key={`${contributor.kind}-${contributor.name}`}
                    className="flex items-center justify-between gap-3 py-1.5 text-xs"
                  >
                    {contributor.href ? (
                      <Link
                        href={contributor.href}
                        aria-label={
                          contributor.name?.trim()
                            ? `Öppna underlaget ${contributor.name}`
                            : "Öppna budgetunderlag"
                        }
                        className="flex min-h-11 min-w-0 flex-1 items-center truncate text-text-primary hover:text-accent"
                      >
                        {contributor.name?.trim() || "Budgetunderlag"}
                      </Link>
                    ) : (
                      <span className="min-w-0 truncate">
                        {contributor.name?.trim() || "Budgetunderlag"}
                      </span>
                    )}
                    <span className="shrink-0 tabular-nums text-text-secondary">
                      {kr(contributor.monthlyMinor, currency)}/mån
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </details>
    </section>
  );
}
