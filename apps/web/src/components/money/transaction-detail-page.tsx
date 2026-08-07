"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { CategoriesResponse, TransactionDetailDto } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function TransactionDetailPage({ transactionId }: { transactionId: string }) {
  const [data, setData] = useState<TransactionDetailDto | null>(null);
  const [categories, setCategories] = useState<CategoriesResponse["items"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [isExcluded, setIsExcluded] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const householdId = await ensureHouseholdSession();
      const [detail, cats] = await Promise.all([
        api.getTransaction(householdId, transactionId),
        api.listCategories(householdId),
      ]);
      setData(detail);
      setCategories(cats.items);
      setCategoryId(detail.categoryId ?? "");
      setNotes(detail.notes ?? "");
      setTags((detail.tags ?? []).join(", "));
      setIsExcluded(Boolean(detail.isExcluded));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fel");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [transactionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setActionError(null);
    try {
      const householdId = await ensureHouseholdSession();
      const updated = await api.updateTransaction(transactionId, {
        householdId,
        categoryId: categoryId || null,
        notes: notes.trim() || null,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        isExcluded,
      });
      setData(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Kunde inte spara");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Hämtar transaktion…" />;
  if (error || !data) {
    return (
      <ErrorState
        title="Kunde inte hämta transaktionen"
        description={error ?? ""}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/transactions" className="text-sm text-accent">
          ← Transaktioner
        </Link>
        <h1 className="mt-2 font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          {data.merchantName ?? data.description ?? "Transaktion"}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          {data.bookingDate} · {data.accountName} · {data.status}
          {data.isInternalTransfer ? " · Intern överföring" : ""}
        </p>
        <p className="mt-3 text-3xl font-medium">
          <MoneyValue value={data.amount} signed />
        </p>
      </div>

      <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm font-medium text-text-secondary">Klassificering</h2>
        <label className="block text-sm">
          <span className="text-text-secondary">Kategori</span>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3"
          >
            <option value="">Ingen kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-text-secondary">Anteckning</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-[12px] border border-border bg-surface px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-text-secondary">Taggar (kommaseparerade)</span>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3"
          />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isExcluded}
            onChange={(e) => setIsExcluded(e.target.checked)}
          />
          Exkludera från översikter
        </label>
        {actionError ? (
          <p className="text-sm text-negative" role="alert">
            {actionError}
          </p>
        ) : null}
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "Sparar…" : "Spara ändringar"}
        </button>
      </section>

      {data.relatedTransfers.length > 0 ? (
        <section className="rounded-[16px] bg-surface-elevated p-5">
          <h2 className="text-sm font-medium text-text-secondary">
            Relaterad överföring
          </h2>
          <ul className="mt-3 space-y-2">
            {data.relatedTransfers.map((rel) => (
              <li key={rel.id}>
                <Link
                  href={`/transactions/${rel.id}`}
                  className="flex min-h-11 items-center justify-between gap-3 text-sm hover:text-accent"
                >
                  <span>
                    {rel.accountName} · {rel.bookingDate}
                    {rel.role ? ` · ${rel.role}` : ""}
                  </span>
                  <MoneyValue value={rel.amount} signed />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
