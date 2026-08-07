"use client";

import { useEffect, useState } from "react";
import type { TransactionDto } from "@ffos/schemas";
import { api, getHouseholdId } from "@/lib/api";
import { MoneyValue } from "../financial/money-value";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function TransactionsPage() {
  const [items, setItems] = useState<TransactionDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const householdId = getHouseholdId();
    if (!householdId) {
      setError("Ingen hushållssession. Öppna översikten först.");
      setLoading(false);
      return;
    }
    void api
      .listTransactions(householdId, 80)
      .then((res) => setItems(res.items))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label="Hämtar transaktioner…" />;
  if (error) {
    return (
      <ErrorState title="Kunde inte hämta transaktioner" description={error} />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Transaktioner
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Source transactions från deterministisk demodata.
        </p>
      </div>
      <ul className="divide-y divide-border rounded-[16px] bg-surface-elevated shadow-[var(--ffos-shadow-soft)]">
        {items.map((tx) => (
          <li key={tx.id} className="flex min-h-14 items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium text-text-primary">
                {tx.merchantName ?? tx.description ?? "Transaktion"}
              </p>
              <p className="text-xs text-text-muted">
                {tx.bookingDate}
                {tx.categoryName ? ` · ${tx.categoryName}` : ""}
                {tx.isInternalTransfer ? " · Intern överföring" : ""}
                {` · ${tx.accountName}`}
              </p>
            </div>
            <MoneyValue
              value={tx.amount}
              signed
              className="shrink-0 text-text-primary"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
