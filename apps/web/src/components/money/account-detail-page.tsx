"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { AccountDetailDto } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function AccountDetailPage({ accountId }: { accountId: string }) {
  const [data, setData] = useState<AccountDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const householdId = await ensureHouseholdSession();
      const detail = await api.getAccount(householdId, accountId);
      setData(detail);
      setName(detail.name);
      setProvider(detail.provider ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fel");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!data) return;
    setSaving(true);
    setActionError(null);
    try {
      const householdId = await ensureHouseholdSession();
      await api.updateAccount(accountId, {
        householdId,
        name: name.trim(),
        provider: provider.trim() || null,
      });
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Kunde inte spara");
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!data) return;
    if (!window.confirm(`Arkivera kontot “${data.name}”?`)) return;
    setSaving(true);
    setActionError(null);
    try {
      const householdId = await ensureHouseholdSession();
      await api.archiveAccount(householdId, accountId);
      window.location.href = "/accounts";
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Kunde inte arkivera");
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Hämtar konto…" />;
  if (error || !data) {
    return (
      <ErrorState
        title="Kunde inte hämta kontot"
        description={error ?? ""}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/accounts" className="text-sm text-accent">
          ← Konton
        </Link>
        <h1 className="mt-2 font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          {data.name}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          {data.accountType}
          {data.provider ? ` · ${data.provider}` : ""}
          {` · ${data.connectionStatus}`}
          {data.freshnessLabel ? ` · ${data.freshnessLabel}` : ""}
        </p>
      </div>

      <section className="rounded-[16px] bg-surface-elevated p-5">
        <p className="text-sm text-text-secondary">Saldo</p>
        <p className="mt-1 text-3xl font-medium">
          <MoneyValue value={data.ledgerBalance ?? data.currentBalance} />
        </p>
        {data.reconciliation?.status === "MISMATCH" &&
        data.reportedBalance &&
        data.ledgerBalance ? (
          <div className="mt-4 space-y-1 text-sm">
            <p className="font-medium text-text-primary">Datakontroll</p>
            <p className="text-text-secondary">
              Bank rapporterade: <MoneyValue value={data.reportedBalance} />
            </p>
            <p className="text-text-secondary">
              Beräknat från transaktioner:{" "}
              <MoneyValue value={data.ledgerBalance} />
            </p>
            {data.reconciliation.difference ? (
              <p className="text-text-secondary">
                Differens: <MoneyValue value={data.reconciliation.difference} />
              </p>
            ) : null}
            <p className="pt-1 text-warning">Behöver granskning</p>
          </div>
        ) : null}
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-text-secondary">Inkomst (period)</dt>
            <dd>
              <MoneyValue value={data.period.income} />
            </dd>
          </div>
          <div>
            <dt className="text-text-secondary">Utgifter (period)</dt>
            <dd>
              <MoneyValue value={data.period.expenses} />
            </dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm font-medium text-text-secondary">Redigera</h2>
        <label className="block text-sm">
          <span className="text-text-secondary">Namn</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3"
          />
        </label>
        <label className="block text-sm">
          <span className="text-text-secondary">Provider</span>
          <input
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3"
          />
        </label>
        {actionError ? (
          <p className="text-sm text-negative" role="alert">
            {actionError}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            Spara
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void archive()}
            className="min-h-11 rounded-[12px] border border-border-strong px-4 text-sm disabled:opacity-60"
          >
            Arkivera
          </button>
        </div>
      </section>

      {data.balanceHistory.length > 0 ? (
        <section className="rounded-[16px] bg-surface-elevated p-5">
          <h2 className="text-sm font-medium text-text-secondary">
            Saldo­historik
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {data.balanceHistory.map((point) => (
              <li key={point.asOf} className="flex justify-between gap-3">
                <span className="text-text-muted">
                  {point.asOf.slice(0, 10)} · {point.source}
                </span>
                <MoneyValue value={point.balance} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-text-secondary">
            Senaste transaktioner
          </h2>
          <Link
            href={`/transactions?accountId=${accountId}`}
            className="text-sm text-accent"
          >
            Visa alla
          </Link>
        </div>
        {data.recentTransactions.length === 0 ? (
          <EmptyState
            title="Inga transaktioner"
            description="Det finns inga bokförda poster på det här kontot ännu."
          />
        ) : (
          <ul className="divide-y divide-border rounded-[16px] bg-surface-elevated">
            {data.recentTransactions.map((tx) => (
              <li key={tx.id}>
                <Link
                  href={`/transactions/${tx.id}`}
                  className="flex min-h-14 items-start justify-between gap-3 px-4 py-3 hover:bg-surface-muted/60"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {tx.merchantName ?? tx.description ?? "Transaktion"}
                    </p>
                    <p className="text-xs text-text-muted">
                      {tx.bookingDate}
                      {tx.categoryName ? ` · ${tx.categoryName}` : ""}
                    </p>
                  </div>
                  <MoneyValue value={tx.amount} signed className="shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
