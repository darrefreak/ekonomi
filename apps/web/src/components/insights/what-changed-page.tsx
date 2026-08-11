"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { WhatChangedDriver, WhatChangedMode, WhatChangedResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { describeError } from "@/lib/error-message";
import { queryKeys } from "@/lib/query-keys";
import { useHouseholdId } from "@/lib/use-household-id";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

/**
 * "Vad har förändrats?" — the change decomposition view.
 *
 * The headline is one number (spending change per month against the chosen
 * reference), then the drivers that explain it, then the one-off purchases that
 * would otherwise mislead a per-month comparison. Every driver links to its
 * evidence: category → merchants → transactions.
 */

const MODES: Array<{ key: WhatChangedMode; label: string }> = [
  { key: "vs_baseline", label: "Mot normalt" },
  { key: "vs_previous_month", label: "Mot förra månaden" },
  { key: "vs_same_month_last_year", label: "Samma månad i fjol" },
  { key: "3m_vs_12m", label: "3 mån mot 12 mån" },
  { key: "ytd_vs_previous_year", label: "Hittills i år mot i fjol" },
];

function kr(minor: string, currency: string, signed = false) {
  return (
    <MoneyValue value={{ amountMinor: minor, currency: currency as "SEK" }} signed={signed} />
  );
}

function changeTone(minor: string, positiveIsGood: boolean): string {
  const value = BigInt(minor);
  if (value === 0n) return "text-text-primary";
  const good = positiveIsGood ? value > 0n : value < 0n;
  return good ? "text-positive" : "text-negative";
}

export function WhatChangedPage() {
  const householdId = useHouseholdId();
  const [mode, setMode] = useState<WhatChangedMode>("vs_baseline");

  const query = useQuery({
    queryKey: queryKeys.whatChanged.mode(householdId ?? "", mode),
    queryFn: () => api.getWhatChanged(householdId!, mode),
    enabled: Boolean(householdId),
  });

  if (!householdId || query.isLoading) {
    return <LoadingState label="Jämför perioder…" />;
  }
  if (query.isError) {
    return (
      <ErrorState
        title="Jämförelsen kunde inte göras"
        description={describeError(query.error, "Försök igen om en stund.")}
      />
    );
  }

  const data = query.data as WhatChangedResponse;
  const hasData =
    BigInt(data.current.expenseMinor) !== 0n || BigInt(data.reference.expenseMinor) !== 0n;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Vad har förändrats?
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          {data.current.label} jämfört med {data.reference.label.toLowerCase()} · per{" "}
          {data.asOf}
        </p>
      </div>

      <div role="group" aria-label="Jämförelse" className="flex flex-wrap gap-2">
        {MODES.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setMode(option.key)}
            aria-pressed={mode === option.key}
            className={`min-h-9 rounded-full px-3.5 text-sm ${
              mode === option.key
                ? "bg-accent/15 font-medium text-accent"
                : "bg-surface-elevated text-text-secondary hover:text-text-primary"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {!hasData ? (
        <EmptyState
          title="För lite data för jämförelsen"
          description="Det behövs transaktioner i båda perioderna för att kunna jämföra. Prova en annan jämförelse eller importera mer historik."
        />
      ) : (
        <>
          {/* The three headline changes, per-month normalised. */}
          <section className="grid gap-4 rounded-[16px] bg-surface-elevated p-5 sm:grid-cols-3">
            <div>
              <p className="text-xs text-text-muted">Utgifter, förändring per månad</p>
              <p
                className={`mt-1 text-2xl font-medium tabular-nums ${changeTone(data.expenseChangeMinor, false)}`}
              >
                {kr(data.expenseChangeMinor, data.currency, true)}
              </p>
              {data.expenseChangePercent !== null ? (
                <p className="mt-0.5 text-xs text-text-muted tabular-nums">
                  {data.expenseChangePercent > 0 ? "+" : ""}
                  {data.expenseChangePercent.toFixed(1).replace(".", ",")} %
                </p>
              ) : null}
            </div>
            <div>
              <p className="text-xs text-text-muted">Inkomst, förändring per månad</p>
              <p
                className={`mt-1 text-2xl font-medium tabular-nums ${changeTone(data.incomeChangeMinor, true)}`}
              >
                {kr(data.incomeChangeMinor, data.currency, true)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Sparande, förändring per månad</p>
              <p
                className={`mt-1 text-2xl font-medium tabular-nums ${changeTone(data.savingsChangeMinor, true)}`}
              >
                {kr(data.savingsChangeMinor, data.currency, true)}
              </p>
            </div>
          </section>

          <DriverSection
            title="Största förändringarna per kategori"
            drivers={data.categoryDrivers}
            currency={data.currency}
            emptyText="Inga tydliga kategoriförändringar mellan perioderna."
          />

          <DriverSection
            title="Största förändringarna per mottagare"
            drivers={data.merchantDrivers}
            currency={data.currency}
            emptyText="Inga tydliga mottagarförändringar mellan perioderna."
          />

          {/* One-offs: part of the totals, isolated so they can be mentally removed. */}
          <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
            <div>
              <h2 className="text-sm font-medium text-text-secondary">Engångsköp</h2>
              <p className="mt-1 text-xs text-text-muted">
                Stora enskilda köp (över {kr(data.oneOffs.thresholdMinor, data.currency)})
                under den aktuella perioden. De <strong>ingår</strong> i summorna ovan —
                listan finns för att du ska kunna räkna bort dem själv.
              </p>
            </div>
            {data.oneOffs.items.length === 0 ? (
              <p className="text-sm text-text-muted">Inga stora engångsköp i perioden.</p>
            ) : (
              <>
                <ul className="divide-y divide-border">
                  {data.oneOffs.items.map((item) => (
                    <li key={item.transactionId} className="py-2.5 first:pt-0 last:pb-0">
                      <Link
                        href={`/transactions/${item.transactionId}`}
                        className="flex items-center justify-between gap-3 hover:text-accent"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm text-text-primary">
                            {item.merchantName ?? item.description}
                          </p>
                          <p className="text-xs text-text-muted">
                            {item.date}
                            {item.categoryName ? ` · ${item.categoryName}` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-medium tabular-nums">
                          {kr(item.amountMinor, data.currency, true)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="border-t border-border pt-2 text-right text-sm tabular-nums text-text-secondary">
                  Totalt {kr(data.oneOffs.totalMinor, data.currency, true)}
                </p>
              </>
            )}
          </section>

          <section className="space-y-2 rounded-[16px] bg-surface-elevated p-5">
            <h2 className="text-sm font-medium text-text-secondary">Så jämförde vi</h2>
            <ul className="space-y-1 text-xs text-text-secondary">
              {data.explanation.map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
            <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
              <div>
                <dt className="text-text-muted">{data.current.label}</dt>
                <dd className="mt-0.5 tabular-nums">
                  {data.current.from} – {data.current.to} · utgifter{" "}
                  {kr(data.current.expenseMinor, data.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">{data.reference.label}</dt>
                <dd className="mt-0.5 tabular-nums">
                  {data.reference.from} – {data.reference.to} · utgifter{" "}
                  {kr(data.reference.expenseMinor, data.currency)}
                </dd>
              </div>
            </dl>
          </section>
        </>
      )}
    </div>
  );
}

function DriverSection({
  title,
  drivers,
  currency,
  emptyText,
}: {
  title: string;
  drivers: WhatChangedDriver[];
  currency: string;
  emptyText: string;
}) {
  return (
    <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
      <h2 className="text-sm font-medium text-text-secondary">{title}</h2>
      {drivers.length === 0 ? (
        <p className="text-sm text-text-muted">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-border">
          {drivers.map((driver) => {
            const row = (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-text-primary">{driver.name}</p>
                  <p className="text-xs tabular-nums text-text-muted">
                    {kr(driver.referenceMinor, currency)} →{" "}
                    {kr(driver.currentMinor, currency)}/mån
                    {driver.percentChange !== null
                      ? ` · ${driver.percentChange > 0 ? "+" : ""}${driver.percentChange
                          .toFixed(0)
                          .replace(".", ",")} %`
                      : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-medium tabular-nums ${changeTone(driver.changeMinor, false)}`}
                >
                  {kr(driver.changeMinor, currency, true)}
                </span>
              </div>
            );
            return (
              <li key={`${driver.kind}-${driver.key}`} className="py-2.5 first:pt-0 last:pb-0">
                {driver.href ? (
                  <Link href={driver.href} className="block hover:text-accent">
                    {row}
                  </Link>
                ) : (
                  row
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
