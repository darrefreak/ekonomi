"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AccountDto } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

const ACCOUNT_TYPES = [
  "CHECKING",
  "SAVINGS",
  "CREDIT_CARD",
  "CASH",
  "INVESTMENT",
  "MORTGAGE",
  "LOAN",
  "ASSET",
  "OTHER",
] as const;

export function AccountsPage() {
  const [items, setItems] = useState<AccountDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [accountType, setAccountType] =
    useState<(typeof ACCOUNT_TYPES)[number]>("CHECKING");
  const [provider, setProvider] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const householdId = await ensureHouseholdSession();
      const data = await api.listAccounts(householdId);
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fel");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setFormError(null);
    try {
      const householdId = await ensureHouseholdSession();
      await api.createAccount({
        householdId,
        name: name.trim(),
        accountType,
        currency: "SEK",
        provider: provider.trim() || null,
        isShared: true,
        openingBalanceMinor: "0",
      });
      setName("");
      setProvider("");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Kunde inte skapa konto");
    } finally {
      setCreating(false);
    }
  }

  if (loading && items.length === 0) {
    return <LoadingState label="Hämtar konton…" />;
  }
  if (error && items.length === 0) {
    return (
      <ErrorState
        title="Kunde inte hämta konton"
        description={error}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Konton
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Hushållets konton med saldo och status.
        </p>
      </div>

      <form
        onSubmit={(e) => void onCreate(e)}
        className="space-y-3 rounded-[16px] bg-surface-elevated p-4"
      >
        <h2 className="text-sm font-medium text-text-secondary">Nytt konto</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block text-sm">
            <span className="text-text-muted">Namn</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Namn"
              className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-text-muted">Typ</span>
            <select
              value={accountType}
              onChange={(e) =>
                setAccountType(e.target.value as (typeof ACCOUNT_TYPES)[number])
              }
              className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm"
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-text-muted">Provider (valfritt)</span>
            <input
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="Provider"
              className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm"
            />
          </label>
        </div>
        {formError ? (
          <p className="text-sm text-negative" role="alert">
            {formError}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={creating}
          className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-white disabled:opacity-60"
        >
          {creating ? "Skapar…" : "Skapa konto"}
        </button>
      </form>

      {items.length === 0 ? (
        <EmptyState
          title="Inga konton ännu"
          description="Skapa ett konto ovan för att börja följa saldon och transaktioner."
        />
      ) : (
        <ul className="divide-y divide-border rounded-[16px] bg-surface-elevated shadow-[var(--ffos-shadow-soft)]">
          {items.map((account) => (
            <li key={account.id}>
              <Link
                href={`/accounts/${account.id}`}
                className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted/60"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{account.name}</p>
                  <p className="text-xs text-text-muted">
                    {account.accountType}
                    {account.provider ? ` · ${account.provider}` : ""}
                    {account.freshnessLabel ? ` · ${account.freshnessLabel}` : ""}
                  </p>
                </div>
                <MoneyValue
                  value={account.currentBalance}
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
