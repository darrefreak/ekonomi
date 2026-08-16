"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useHouseholdId } from "@/lib/use-household-id";
import { queryKeys } from "@/lib/query-keys";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { NewTransactionForm } from "./new-transaction-form";
import { describeError } from "@/lib/error-message";

function readQueryParam(name: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

export function TransactionsPage() {
  const householdId = useHouseholdId();
  const [q, setQ] = useState("");
  const [accountId, setAccountId] = useState(() => readQueryParam("accountId"));
  const [from, setFrom] = useState(() => readQueryParam("from"));
  const [to, setTo] = useState(() => readQueryParam("to"));
  // Drill-down filters arrive via URL from reports/insights; they are shown as
  // removable chips rather than duplicated as form fields.
  const [categoryId, setCategoryId] = useState(() => readQueryParam("categoryId"));
  const [merchantId, setMerchantId] = useState(() => readQueryParam("merchantId"));
  const [merchantMissing, setMerchantMissing] = useState(
    () => readQueryParam("merchantMissing") === "true",
  );
  const [includeExcluded, setIncludeExcluded] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const filters = {
    q,
    accountId,
    from,
    to,
    categoryId,
    merchantId,
    merchantMissing,
    includeExcluded,
  };

  const transactionsQuery = useQuery({
    queryKey: householdId
      ? queryKeys.transactions.all(householdId, filters)
      : ["transactions", "pending"],
    queryFn: () =>
      api.listTransactions(householdId!, {
        limit: 80,
        q: q || undefined,
        accountId: accountId || undefined,
        from: from || undefined,
        to: to || undefined,
        categoryId: categoryId || undefined,
        merchantId: merchantId || undefined,
        merchantMissing,
        includeExcluded,
      }),
    enabled: Boolean(householdId),
  });

  const accountsQuery = useQuery({
    queryKey: householdId ? queryKeys.accounts.all(householdId) : ["accounts", "pending"],
    queryFn: () => api.listAccounts(householdId!),
    enabled: Boolean(householdId),
  });

  const categoriesQuery = useQuery({
    queryKey: householdId ? queryKeys.categories.all(householdId) : ["categories", "pending"],
    queryFn: () => api.listCategories(householdId!),
    enabled: Boolean(householdId),
  });

  const items = transactionsQuery.data?.items ?? [];
  const accounts = accountsQuery.data?.items ?? [];
  const categories = categoriesQuery.data?.items ?? [];

  if (!householdId || (transactionsQuery.isLoading && items.length === 0 && !transactionsQuery.isError)) {
    return <LoadingState label="Hämtar transaktioner…" />;
  }
  if (transactionsQuery.isError && items.length === 0) {
    return (
      <ErrorState
        title="Kunde inte hämta transaktioner"
        description={describeError(transactionsQuery.error, "Något gick fel")}
        onRetry={() => void transactionsQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
            Transaktioner
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Sök, filtrera och öppna poster för klassificering.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNew((v) => !v)}
          className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-on-accent"
        >
          {showNew ? "Stäng" : "+ Ny händelse"}
        </button>
      </div>

      {showNew && householdId ? (
        <NewTransactionForm
          householdId={householdId}
          accounts={accounts}
          categories={categories}
          onDone={() => setShowNew(false)}
        />
      ) : null}

      {categoryId || merchantId || merchantMissing ? (
        <div className="flex flex-wrap items-center gap-2" data-testid="drill-filters">
          <span className="text-xs text-text-muted">Filtrerat på</span>
          {categoryId ? (
            <button
              type="button"
              onClick={() => setCategoryId("")}
              className="inline-flex min-h-11 items-center gap-1 rounded-full bg-accent/10 px-3 text-sm text-accent"
            >
              {categories.find((c) => c.id === categoryId)?.name ?? "Kategori"}
              <span aria-hidden>×</span>
              <span className="sr-only">Ta bort kategorifilter</span>
            </button>
          ) : null}
          {merchantId ? (
            <button
              type="button"
              onClick={() => setMerchantId("")}
              className="inline-flex min-h-11 items-center gap-1 rounded-full bg-accent/10 px-3 text-sm text-accent"
            >
              Mottagare
              <span aria-hidden>×</span>
              <span className="sr-only">Ta bort mottagarfilter</span>
            </button>
          ) : null}
          {merchantMissing ? (
            <button
              type="button"
              onClick={() => setMerchantMissing(false)}
              className="inline-flex min-h-11 items-center gap-1 rounded-full bg-accent/10 px-3 text-sm text-accent"
            >
              Okänd mottagare
              <span aria-hidden>×</span>
              <span className="sr-only">Ta bort filter för okänd mottagare</span>
            </button>
          ) : null}
        </div>
      ) : null}

      <form
        className="grid gap-3 md:grid-cols-2 lg:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault();
          void transactionsQuery.refetch();
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Sök transaktioner"
          type="search"
          placeholder="Sök mottagare, kategori…"
          className="min-h-11 rounded-[12px] border border-border bg-surface-elevated px-3 text-sm lg:col-span-2"
        />
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          aria-label="Filtrera på konto"
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
          className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-on-accent"
        >
          Filtrera
        </button>
        <label className="flex min-h-11 items-center gap-2 text-sm text-text-secondary lg:col-span-6">
          <input
            type="checkbox"
            checked={includeExcluded}
            onChange={(e) => setIncludeExcluded(e.target.checked)}
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
            setCategoryId("");
            setMerchantId("");
            setMerchantMissing(false);
            setIncludeExcluded(false);
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
