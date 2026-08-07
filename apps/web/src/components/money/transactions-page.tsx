"use client";

import { useEffect, useState } from "react";
import type { AccountDto, TransactionDto } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function TransactionsPage() {
  const [items, setItems] = useState<TransactionDto[]>([]);
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [q, setQ] = useState("");
  const [accountId, setAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ensureHouseholdSession()
      .then(async (householdId) => {
        const [tx, acc] = await Promise.all([
          api.listTransactions(householdId, { limit: 80 }),
          api.listAccounts(householdId),
        ]);
        setItems(tx.items);
        setAccounts(acc.items);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function applyFilters(nextQ = q, nextAccountId = accountId) {
    setLoading(true);
    setError(null);
    try {
      const householdId = await ensureHouseholdSession();
      const tx = await api.listTransactions(householdId, {
        limit: 80,
        q: nextQ || undefined,
        accountId: nextAccountId || undefined,
      });
      setItems(tx.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fel");
    } finally {
      setLoading(false);
    }
  }

  if (loading && items.length === 0) {
    return <LoadingState label="Hämtar transaktioner…" />;
  }
  if (error && items.length === 0) {
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
          Sök och filtrera source transactions.
        </p>
      </div>

      <form
        className="grid gap-3 md:grid-cols-[1fr_12rem_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          void applyFilters();
        }}
      >
        <label className="block">
          <span className="sr-only">Sök</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Sök merchant, kategori…"
            className="min-h-11 w-full rounded-[12px] border border-border bg-surface-elevated px-3 text-sm"
          />
        </label>
        <label className="block">
          <span className="sr-only">Konto</span>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="min-h-11 w-full rounded-[12px] border border-border bg-surface-elevated px-3 text-sm"
          >
            <option value="">Alla konton</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-white"
        >
          Filtrera
        </button>
      </form>

      <ul className="divide-y divide-border rounded-[16px] bg-surface-elevated shadow-[var(--ffos-shadow-soft)]">
        {items.map((tx) => (
          <li
            key={tx.id}
            className="flex min-h-14 items-start justify-between gap-3 px-4 py-3"
          >
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
            <MoneyValue value={tx.amount} signed className="shrink-0 text-text-primary" />
          </li>
        ))}
      </ul>
    </div>
  );
}
