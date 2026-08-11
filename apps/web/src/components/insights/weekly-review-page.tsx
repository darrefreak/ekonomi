"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { WeeklyReview } from "@ffos/schemas";
import { api } from "@/lib/api";
import { describeError } from "@/lib/error-message";
import { queryKeys } from "@/lib/query-keys";
import { useHouseholdId } from "@/lib/use-household-id";
import { MoneyValue } from "../financial/money-value";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

/**
 * The Weekly Review: what happened this week, in the order a person would
 * tell it — spending, the big things, what changed, what is new, what comes
 * next, and whether anything needs a decision.
 */

const CONFIDENCE_LABEL: Record<string, string> = {
  KNOWN: "Känd",
  EXPECTED: "Förväntad",
  ESTIMATED: "Uppskattad",
};

function kr(minor: string | null, currency: string, signed = false) {
  if (minor === null) return <span className="text-text-muted">–</span>;
  return (
    <MoneyValue value={{ amountMinor: minor, currency: currency as "SEK" }} signed={signed} />
  );
}

export function WeeklyReviewPage() {
  const householdId = useHouseholdId();
  const query = useQuery({
    queryKey: queryKeys.reports.weekly(householdId ?? ""),
    queryFn: () => api.getWeeklyReview(householdId!),
    enabled: Boolean(householdId),
  });

  if (!householdId || query.isLoading) {
    return <LoadingState label="Sammanfattar veckan…" />;
  }
  if (query.isError) {
    return (
      <ErrorState
        title="Veckans översikt kunde inte hämtas"
        description={describeError(query.error, "Försök igen om en stund.")}
      />
    );
  }

  const data = query.data as WeeklyReview;
  const weekChange = BigInt(data.spendingMinor) - BigInt(data.previousWeekSpendingMinor);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Veckan
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          {data.weekLabel} · {data.from} – {data.to}
        </p>
      </div>

      <section className="grid grid-cols-2 gap-4 rounded-[16px] bg-surface-elevated p-5 sm:grid-cols-3">
        <div>
          <p className="text-xs text-text-muted">Utgifter</p>
          <p className="mt-0.5 text-lg font-medium tabular-nums">
            {kr(data.spendingMinor, data.currency)}
          </p>
          <p
            className={`mt-0.5 text-xs tabular-nums ${weekChange > 0n ? "text-negative" : "text-positive"}`}
          >
            {kr(weekChange.toString(), data.currency, true)} mot förra veckan
          </p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Inkomster</p>
          <p className="mt-0.5 text-lg font-medium tabular-nums text-positive">
            {kr(data.incomeMinor, data.currency)}
          </p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Sparande hittills i månaden</p>
          <p className="mt-0.5 text-lg font-medium tabular-nums">
            {kr(data.savingsProgress.monthToDateMinor, data.currency)}
          </p>
          {data.savingsProgress.recommendedMonthlyMinor ? (
            <p className="mt-0.5 text-xs tabular-nums text-text-muted">
              mål {kr(data.savingsProgress.recommendedMonthlyMinor, data.currency)}/mån
            </p>
          ) : null}
        </div>
      </section>

      {data.reviewCount > 0 ? (
        <Link
          href="/review"
          className="block rounded-[16px] border border-warning/40 bg-warning/10 p-4 text-sm hover:border-warning"
        >
          <span className="font-medium tabular-nums">{data.reviewCount}</span>{" "}
          {data.reviewCount === 1 ? "mönster behöver" : "mönster behöver"} din hjälp →
        </Link>
      ) : null}

      <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm font-medium text-text-secondary">Veckans största utgifter</h2>
        {data.largestExpenses.length === 0 ? (
          <p className="text-sm text-text-muted">Inga utgifter registrerade denna vecka.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.largestExpenses.map((item) => (
              <li key={item.transactionId} className="py-2.5 first:pt-0 last:pb-0">
                <Link
                  href={`/transactions/${item.transactionId}`}
                  className="flex items-center justify-between gap-3 hover:text-accent"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{item.merchantName ?? item.description}</p>
                    <p className="text-xs text-text-muted">{item.date}</p>
                  </div>
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {kr(item.amountMinor, data.currency, true)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.categoryChanges.length > 0 ? (
        <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
          <h2 className="text-sm font-medium text-text-secondary">
            Största förändringarna mot förra veckan
          </h2>
          <ul className="divide-y divide-border">
            {data.categoryChanges.map((item) => (
              <li
                key={item.categoryKey}
                className="flex items-baseline justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0"
              >
                <span className="min-w-0 truncate">{item.categoryName}</span>
                <span
                  className={`shrink-0 tabular-nums ${
                    BigInt(item.changeMinor) > 0n ? "text-negative" : "text-positive"
                  }`}
                >
                  {kr(item.changeMinor, data.currency, true)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.newRecurring.length > 0 ? (
        <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
          <h2 className="text-sm font-medium text-text-secondary">Nytt återkommande</h2>
          <ul className="divide-y divide-border">
            {data.newRecurring.map((item) => (
              <li
                key={item.recurringId}
                className="flex items-baseline justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate">{item.name}</p>
                  {item.firstSeenOn ? (
                    <p className="text-xs text-text-muted">Först sedd {item.firstSeenOn}</p>
                  ) : null}
                </div>
                <span className="shrink-0 tabular-nums text-text-secondary">
                  {item.monthlyEquivalentMinor
                    ? <>{kr(item.monthlyEquivalentMinor, data.currency)}/mån</>
                    : "varierande"}
                </span>
              </li>
            ))}
          </ul>
          <Link href="/subscriptions" className="text-sm font-medium text-accent">
            Bekräfta eller avvisa →
          </Link>
        </section>
      ) : null}

      <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-text-secondary">Nästa vecka</h2>
          <Link href="/calendar" className="text-sm text-accent">
            Kalender →
          </Link>
        </div>
        {data.upcomingNextWeek.length === 0 ? (
          <p className="text-sm text-text-muted">
            Inga kända eller förväntade händelser nästa vecka.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {data.upcomingNextWeek.map((item, index) => (
              <li
                key={`${item.title}-${item.date}-${index}`}
                className="flex items-baseline justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate">{item.title}</p>
                  <p className="text-xs text-text-muted">
                    {item.date} · {CONFIDENCE_LABEL[item.confidence] ?? item.confidence}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums">
                  {kr(item.amountMinor, data.currency, true)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
