"use client";

import { useEffect, useState } from "react";
import type { AccountDto } from "@ffos/schemas";
import { api, getHouseholdId } from "@/lib/api";
import { MoneyValue } from "../financial/money-value";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function AccountsPage() {
  const [items, setItems] = useState<AccountDto[]>([]);
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
      .listAccounts(householdId)
      .then((res) => setItems(res.items))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label="Hämtar konton…" />;
  if (error) {
    return (
      <ErrorState title="Kunde inte hämta konton" description={error} />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Konton
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Saldo från seedade konton. Ledger är källan bakom händelserna.
        </p>
      </div>
      <ul className="divide-y divide-border rounded-[16px] bg-surface-elevated shadow-[var(--ffos-shadow-soft)]">
        {items.map((account) => (
          <li key={account.id} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="font-medium text-text-primary">{account.name}</p>
              <p className="text-xs text-text-muted">
                {account.provider ?? "Manuell"} · {account.accountType}
              </p>
            </div>
            <MoneyValue value={account.currentBalance} className="text-text-primary" />
          </li>
        ))}
      </ul>
    </div>
  );
}
