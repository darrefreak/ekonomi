"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { AccountDto, TransactionDto } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

function readQueryAccountId() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("accountId") ?? "";
}

export function TransactionsPage() {
  const [items, setItems] = useState<TransactionDto[]>([]);
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [q, setQ] = useState("");
  const [accountId, setAccountId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [includeExcluded, setIncludeExcluded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (opts?: {
      q?: string;
      accountId?: string;
      from?: string;
      to?: string;
      includeExcluded?: boolean;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const householdId = await ensureHouseholdSession();
        const [tx, acc] = await Promise.all([
          api.listTransactions(householdId, {
            limit: 80,
            q: opts?.q || undefined,
            accountId: opts?.accountId || undefined,
            from: opts?.from || undefined,
            to: opts?.to || undefined,
            includeExcluded: opts?.includeExcluded,
          }),
          api.listAccounts(householdId),
        ]);
        setItems(tx.items);
        setAccounts(acc.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fel");
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const initialAccount = readQueryAccountId();
    if (initialAccount) setAccountId(initialAccount);
    void load({ accountId: initialAccount || undefined });
  }, [load]);

  if (loading && items.length === 0 && !error) {
    return <LoadingState label="Hämtar transaktioner…" />;
  }
  if (error && items.length === 0) {
    return (
      <ErrorState
        title="Kunde inte hämta transaktioner"
        description={error}
        onRetry={() =>
          void load({ q, accountId, from, to, includeExcluded })
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Transaktioner
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Sök, filtrera och öppna poster för klassificering.
        </p>
      </div>

      <form
        className="grid gap-3 md:grid-cols-2 lg:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault();
          void load({ q, accountId, from, to, includeExcluded });
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Sök merchant, kategori…"
          className="min-h-11 rounded-[12px] border border-border bg-surface-elevated px-3 text-sm lg:col-span-2"
        />
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="min-h-11 rounded-[12px] border border-border bg-surface-elevated px-3 text-sm"
        >
          <option value="">Alla konton</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="min-h-11 rounded-[12px] border border-border bg-surface-elevated px-3 text-sm"
          aria-label="Från datum"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="min-h-11 rounded-[12px] border border-border bg-surface-elevated px-3 text-sm"
          aria-label="Till datum"
        />
        <button
          type="submit"
          className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-white"
        >
          Filtrera
        </button>
        <label className="flex min-h-11 items-center gap-2 text-sm text-text-secondary lg:col-span-6">
          <input
            type="checkbox"
            checked={includeExcluded}
            onChange={(e) => {
              const next = e.target.checked;
              setIncludeExcluded(next);
              void load({ q, accountId, from, to, includeExcluded: next });
            }}
          />
          Visa exkluderade
        </label>
      </form>

      {items.length === 0 ? (
        <EmptyState
          title="Inga träffar"
          description="Justera sökningen eller datumen, eller rensa filtren."
          actionLabel="Rensa filter"
          onAction={() => {
            setQ("");
            setAccountId("");
            setFrom("");
            setTo("");
            setIncludeExcluded(false);
            void load({});
          }}
        />
      ) : (
        <ul className="divide-y divide-border rounded-[16px] bg-surface-elevated shadow-[var(--ffos-shadow-soft)]">
          {items.map((tx) => (
            <li key={tx.id}>
              <Link
                href={`/transactions/${tx.id}`}
                className="flex min-h-14 items-start justify-between gap-3 px-4 py-3 hover:bg-surface-muted/60"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-text-primary">
                    {tx.merchantName ?? tx.description ?? "Transaktion"}
                    {tx.isExcluded ? " · exkluderad" : ""}
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
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
