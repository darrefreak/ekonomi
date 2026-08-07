"use client";

import { useEffect, useState } from "react";
import type { AccountDetailDto } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function AccountDetailPage({ accountId }: { accountId: string }) {
  const [data, setData] = useState<AccountDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ensureHouseholdSession()
      .then((householdId) => api.getAccount(householdId, accountId))
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [accountId]);

  if (loading) return <LoadingState label="Hämtar konto…" />;
  if (error || !data) {
    return (
      <ErrorState
        title="Kunde inte hämta kontot"
        description={error ?? "Kontot hittades inte."}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-text-muted">{data.provider ?? "Konto"}</p>
        <h1 className="mt-1 font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          {data.name}
        </h1>
        <p className="mt-2 text-3xl font-medium tabular-nums">
          <MoneyValue value={data.currentBalance} />
        </p>
        <p className="mt-2 text-sm text-text-secondary">
          {data.connectionStatus} · {data.freshnessLabel ?? "ingen synk"}
        </p>
      </div>

      <section className="grid gap-3 rounded-[16px] bg-surface-elevated p-5 md:grid-cols-2">
        <div>
          <p className="text-xs text-text-muted">Inkomst (period)</p>
          <p className="mt-1 text-lg">
            <MoneyValue value={data.period.income} />
          </p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Utgifter (period)</p>
          <p className="mt-1 text-lg">
            <MoneyValue value={data.period.expenses} />
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-text-secondary">Senaste transaktioner</h2>
        <ul className="mt-3 divide-y divide-border rounded-[16px] bg-surface-elevated">
          {data.recentTransactions.map((tx) => (
            <li
              key={tx.id}
              className="flex min-h-14 items-start justify-between gap-3 px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  {tx.merchantName ?? tx.description ?? "Transaktion"}
                </p>
                <p className="text-xs text-text-muted">
                  {tx.bookingDate}
                  {tx.categoryName ? ` · ${tx.categoryName}` : ""}
                </p>
              </div>
              <MoneyValue value={tx.amount} signed />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
