"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { useHouseholdId } from "@/lib/use-household-id";
import { queryKeys } from "@/lib/query-keys";
import { MoneyValue } from "../financial/money-value";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { MerchantPicker } from "./merchant-picker";
import { SplitEditor } from "./split-editor";
import { describeError } from "@/lib/error-message";

export function TransactionDetailPage({ transactionId }: { transactionId: string }) {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();

  const detailQuery = useQuery({
    queryKey: householdId
      ? queryKeys.transactions.detail(householdId, transactionId)
      : ["transactions", "detail", "pending"],
    queryFn: () => api.getTransaction(householdId!, transactionId),
    enabled: Boolean(householdId),
  });

  const categoriesQuery = useQuery({
    queryKey: householdId ? queryKeys.categories.all(householdId) : ["categories", "pending"],
    queryFn: () => api.listCategories(householdId!),
    enabled: Boolean(householdId),
  });

  const accountsQuery = useQuery({
    queryKey: householdId ? queryKeys.accounts.all(householdId) : ["accounts", "pending"],
    queryFn: () => api.listAccounts(householdId!),
    enabled: Boolean(householdId),
  });

  const data = detailQuery.data;
  const [categoryId, setCategoryId] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [isExcluded, setIsExcluded] = useState(false);
  const [isInternalTransfer, setIsInternalTransfer] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refundMinor, setRefundMinor] = useState("");
  const [refundMsg, setRefundMsg] = useState<string | null>(null);
  const [reviseToAccountId, setReviseToAccountId] = useState("");
  const [reviseMsg, setReviseMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setCategoryId(data.categoryId ?? "");
    setMerchantId(data.merchantId ?? "");
    setNotes(data.notes ?? "");
    setTags((data.tags ?? []).join(", "));
    setIsExcluded(Boolean(data.isExcluded));
    setIsInternalTransfer(Boolean(data.isInternalTransfer));
  }, [data]);

  async function invalidateAfterMutation() {
    if (!householdId) return;
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.transactions.detail(householdId, transactionId),
      }),
      queryClient.invalidateQueries({ queryKey: ["transactions", householdId] }),
      queryClient.invalidateQueries({ queryKey: ["accounts", householdId] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all(householdId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.all(householdId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.review.all(householdId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.metrics.all(householdId) }),
    ]);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const id = await ensureHouseholdSession();
      return api.updateTransaction(transactionId, {
        householdId: id,
        categoryId: categoryId || null,
        merchantId: merchantId || null,
        notes: notes.trim() || null,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        isExcluded,
        isInternalTransfer,
      });
    },
    onSuccess: async () => {
      setActionError(null);
      await invalidateAfterMutation();
    },
    onError: (err: unknown) => {
      setActionError(describeError(err, "Kunde inte spara"));
    },
  });

  const refundMutation = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error("Transaktionen är inte laddad.");
      const id = await ensureHouseholdSession();
      if (!refundMinor || BigInt(refundMinor) <= 0n) {
        throw new Error("Ange ett positivt belopp i öre.");
      }
      return api.createCashRefund({
        householdId: id,
        cashAccountId: data.accountId,
        amountMinor: refundMinor,
        occurredOn: data.bookingDate,
        description: `Återbetalning för ${data.description ?? data.id}`,
        externalId: `ui-refund-${data.id}-${refundMinor}`,
      });
    },
    onSuccess: async (result) => {
      setActionError(null);
      setRefundMsg(`Sparad återbetalning ${result.id} (utgift ${result.expenseAmountMinor} öre)`);
      setRefundMinor("");
      await invalidateAfterMutation();
    },
    onError: (err: unknown) => {
      setActionError(describeError(err, "Kunde inte skapa återbetalning"));
    },
  });

  const reviseMutation = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error("Transaktionen är inte laddad.");
      if (!data.financialEventId) {
        throw new Error("Transaktionen är inte kopplad till en bokförd ledger-händelse.");
      }
      if (!reviseToAccountId) throw new Error("Välj mottagarkonto för överföringen.");
      const id = await ensureHouseholdSession();
      const amountMinor =
        BigInt(data.amount.amountMinor) < 0n
          ? (-BigInt(data.amount.amountMinor)).toString()
          : data.amount.amountMinor;
      return api.reviseExpenseToTransfer({
        householdId: id,
        financialEventId: data.financialEventId,
        mode: "EXPENSE_TO_TRANSFER",
        fromAccountId: data.accountId,
        toAccountId: reviseToAccountId,
        amountMinor,
        occurredOn: data.bookingDate,
        description: data.description ?? undefined,
      });
    },
    onSuccess: async () => {
      setActionError(null);
      setReviseMsg("Omklassificerad som intern överföring.");
      await invalidateAfterMutation();
    },
    onError: (err: unknown) => {
      setActionError(
        describeError(err, "Kunde inte omklassificera transaktionen"),
      );
    },
  });

  if (!householdId || detailQuery.isLoading) return <LoadingState label="Hämtar transaktion…" />;
  if (detailQuery.isError || !data) {
    return (
      <ErrorState
        title="Kunde inte hämta transaktionen"
        description={
          detailQuery.error instanceof Error ? detailQuery.error.message : "Något gick fel"
        }
        onRetry={() => void detailQuery.refetch()}
      />
    );
  }

  const categories = categoriesQuery.data?.items ?? [];
  const accounts = accountsQuery.data?.items ?? [];
  const sourceAmountMinor =
    BigInt(data.amount.amountMinor) < 0n
      ? (-BigInt(data.amount.amountMinor)).toString()
      : data.amount.amountMinor;

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

        {householdId ? (
          <MerchantPicker
            householdId={householdId}
            value={merchantId}
            onChange={setMerchantId}
          />
        ) : (
          <div className="rounded-[12px] border border-dashed border-border px-3 py-2 text-sm text-text-muted">
            Butik: {data.merchantName ?? "okänd"}
          </div>
        )}

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
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isInternalTransfer}
            onChange={(e) => setIsInternalTransfer(e.target.checked)}
          />
          Markera som intern överföring (metadata-flagga)
        </label>
        {actionError ? (
          <p className="text-sm text-negative" role="alert">
            {actionError}
          </p>
        ) : null}
        <button
          type="button"
          disabled={saveMutation.isPending}
          onClick={() => void saveMutation.mutate()}
          className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-white disabled:opacity-60"
        >
          {saveMutation.isPending ? "Sparar…" : "Spara ändringar"}
        </button>
      </section>

      {data.financialEventId && !data.isInternalTransfer ? (
        <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
          <h2 className="text-sm font-medium text-text-secondary">
            Omklassificera till intern överföring
          </h2>
          <p className="text-sm text-text-secondary">
            Skapar en riktig ledger-överföring istället för en utgift. Intern
            överföring — räknas inte som utgift.
          </p>
          <label className="block text-sm">
            <span className="text-text-secondary">Mottagarkonto</span>
            <select
              value={reviseToAccountId}
              onChange={(e) => setReviseToAccountId(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3"
            >
              <option value="">Välj konto</option>
              {accounts
                .filter((a) => a.id !== data.accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
          {reviseMsg ? (
            <p className="text-sm text-positive" role="status">
              {reviseMsg}
            </p>
          ) : null}
          <button
            type="button"
            disabled={reviseMutation.isPending || !reviseToAccountId}
            onClick={() => void reviseMutation.mutate()}
            className="min-h-11 rounded-[12px] border border-border-strong px-4 text-sm font-medium disabled:opacity-60"
          >
            {reviseMutation.isPending ? "Omklassificerar…" : "Omklassificera som överföring"}
          </button>
        </section>
      ) : null}

      {data.financialEventId ? (
        <SplitEditor
          householdId={householdId}
          financialEventId={data.financialEventId}
          sourceAmountMinor={sourceAmountMinor}
          categories={categories}
        />
      ) : null}

      <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm font-medium text-text-secondary">
          Återbetalning (ledger)
        </h2>
        <p className="text-sm text-text-secondary">
          Registrerar en kontant återbetalning som minskar periodens utgift — inte
          som lön/inkomst.
        </p>
        <label className="block text-sm">
          <span className="text-text-secondary">Belopp (öre, heltal)</span>
          <input
            value={refundMinor}
            onChange={(e) => setRefundMinor(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="50000"
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3"
          />
        </label>
        {refundMsg ? (
          <p className="text-sm text-text-secondary" role="status">
            {refundMsg}
          </p>
        ) : null}
        <button
          type="button"
          disabled={refundMutation.isPending || !refundMinor}
          onClick={() => void refundMutation.mutate()}
          className="min-h-11 rounded-[12px] border border-border bg-surface px-4 text-sm font-medium disabled:opacity-60"
        >
          {refundMutation.isPending ? "Sparar…" : "Registrera återbetalning"}
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
