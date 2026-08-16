"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { WhatChangedResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useHouseholdId } from "@/lib/use-household-id";
import { MoneyValue } from "../financial/money-value";

/**
 * The dashboard's "spending vs normal" answer: one number against the
 * household's own baseline plus the two or three drivers behind it. Everything
 * deeper lives on /what-changed — this card is the doorway.
 */
export function SpendingVsNormalCard() {
  const householdId = useHouseholdId();
  const query = useQuery({
    queryKey: queryKeys.whatChanged.mode(householdId ?? "", "vs_baseline"),
    queryFn: () => api.getWhatChanged(householdId!, "vs_baseline"),
    enabled: Boolean(householdId),
    staleTime: 60_000,
  });

  return (
    <section
      className="rounded-[18px] bg-surface-elevated p-5 shadow-[var(--ffos-shadow-soft)]"
      data-testid="spending-vs-normal"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-text-secondary">Mot normalt</h2>
        <Link
          href="/what-changed"
          className="inline-flex min-h-11 items-center text-sm text-accent"
        >
          Vad har förändrats? →
        </Link>
      </div>

      {query.isLoading || !householdId ? (
        <p className="mt-2 text-sm text-text-muted">Jämför mot din baslinje…</p>
      ) : query.isError ? (
        <p className="mt-2 text-sm text-text-secondary">
          Jämförelsen kunde inte hämtas just nu.
        </p>
      ) : query.data ? (
        <VsNormalBody data={query.data} />
      ) : null}
    </section>
  );
}

function VsNormalBody({ data }: { data: WhatChangedResponse }) {
  const change = BigInt(data.expenseChangeMinor);
  const drivers = data.categoryDrivers.slice(0, 3);

  return (
    <>
      <p className="mt-2 text-2xl font-medium tabular-nums">
        <span className={change > 0n ? "text-negative" : "text-positive"}>
          <MoneyValue
            value={{ amountMinor: data.expenseChangeMinor, currency: data.currency as "SEK" }}
            signed
          />
        </span>
        <span className="ml-2 text-sm font-normal text-text-muted">
          utgifter/mån mot {data.reference.label.toLowerCase()}
        </span>
      </p>
      {drivers.length > 0 ? (
        <ul className="mt-3 divide-y divide-border text-sm">
          {drivers.map((driver) => (
            <li key={driver.key} className="flex min-h-11 items-center justify-between gap-3">
              {driver.href ? (
                <Link
                  href={driver.href}
                  className="flex min-h-11 min-w-0 flex-1 items-center truncate hover:text-accent"
                >
                  {driver.name}
                </Link>
              ) : (
                <span className="min-w-0 truncate">{driver.name}</span>
              )}
              <span
                className={`shrink-0 tabular-nums ${
                  BigInt(driver.changeMinor) > 0n ? "text-negative" : "text-positive"
                }`}
              >
                <MoneyValue
                  value={{ amountMinor: driver.changeMinor, currency: data.currency as "SEK" }}
                  signed
                />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-text-muted">
          Inga tydliga avvikelser mot din normala nivå.
        </p>
      )}
    </>
  );
}
