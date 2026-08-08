"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AccountDto, CategoriesResponse } from "@ffos/schemas";
import { moneyFromJson } from "@ffos/domain";
import { formatMoney } from "@ffos/utils";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { kronorToMinorString } from "@/lib/money-input";
import { queryKeys } from "@/lib/query-keys";

const CASH_LIKE_TYPES = new Set(["CHECKING", "SAVINGS", "CASH"]);
const CREDIT_CARD_TYPES = new Set(["CREDIT_CARD"]);
const MORTGAGE_LIKE_TYPES = new Set(["MORTGAGE", "LOAN"]);
const INVESTMENT_TYPES = new Set(["INVESTMENT"]);

type Kind =
  | "EXPENSE"
  | "INCOME"
  | "TRANSFER"
  | "REFUND"
  | "CREDIT_CARD_PURCHASE"
  | "CREDIT_CARD_PAYMENT"
  | "MORTGAGE_PAYMENT"
  | "INVESTMENT_TRANSFER";

const KIND_LABELS: Record<Kind, string> = {
  EXPENSE: "Utgift",
  INCOME: "Inkomst",
  TRANSFER: "Intern överföring",
  REFUND: "Återbetalning",
  CREDIT_CARD_PURCHASE: "Kreditkortsköp",
  CREDIT_CARD_PAYMENT: "Kreditkortsbetalning",
  MORTGAGE_PAYMENT: "Bolånebetalning",
  INVESTMENT_TRANSFER: "Investeringsöverföring",
};

/** Kinds that move money between two accounts (from → to) rather than a single account. */
const TWO_ACCOUNT_KINDS = new Set<Kind>([
  "TRANSFER",
  "CREDIT_CARD_PAYMENT",
  "MORTGAGE_PAYMENT",
  "INVESTMENT_TRANSFER",
]);

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NewTransactionForm({
  householdId,
  accounts,
  categories,
  onDone,
}: {
  householdId: string;
  accounts: AccountDto[];
  categories: CategoriesResponse["items"];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<Kind>("EXPENSE");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [principalAmount, setPrincipalAmount] = useState("");
  const [interestAmount, setInterestAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const cashAccounts = accounts.filter((a) => CASH_LIKE_TYPES.has(a.accountType));
  const creditCardAccounts = accounts.filter((a) => CREDIT_CARD_TYPES.has(a.accountType));
  const mortgageAccounts = accounts.filter((a) => MORTGAGE_LIKE_TYPES.has(a.accountType));
  const investmentAccounts = accounts.filter((a) => INVESTMENT_TYPES.has(a.accountType));

  const isTwoAccountKind = TWO_ACCOUNT_KINDS.has(kind);
  const isMortgage = kind === "MORTGAGE_PAYMENT";

  const primaryAccounts =
    kind === "TRANSFER"
      ? accounts
      : kind === "CREDIT_CARD_PURCHASE"
        ? creditCardAccounts
        : cashAccounts;
  const primaryLabel = kind === "TRANSFER" ? "Från konto" : kind === "CREDIT_CARD_PURCHASE" ? "Kreditkort" : "Konto";

  const secondaryAccounts =
    kind === "TRANSFER"
      ? accounts.filter((a) => a.id !== accountId)
      : kind === "CREDIT_CARD_PAYMENT"
        ? creditCardAccounts
        : kind === "MORTGAGE_PAYMENT"
          ? mortgageAccounts
          : kind === "INVESTMENT_TRANSFER"
            ? investmentAccounts
            : [];
  const secondaryLabel =
    kind === "TRANSFER"
      ? "Till konto"
      : kind === "CREDIT_CARD_PAYMENT"
        ? "Kreditkort"
        : kind === "MORTGAGE_PAYMENT"
          ? "Bolån/lån"
          : kind === "INVESTMENT_TRANSFER"
            ? "Investeringskonto"
            : "";

  async function invalidateAfterMutation() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["transactions", householdId] }),
      queryClient.invalidateQueries({ queryKey: ["accounts", householdId] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all(householdId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.all(householdId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.review.all(householdId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.metrics.all(householdId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.netWorth.all(householdId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.debt.all(householdId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.investments.all(householdId) }),
    ]);
  }

  function resetForm() {
    setAmount("");
    setPrincipalAmount("");
    setInterestAmount("");
    setDescription("");
    setCategoryId("");
    setMerchantName("");
    setToAccountId("");
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const id = await ensureHouseholdSession();
      if (!accountId) throw new Error("Välj ett konto.");
      if (!occurredOn) throw new Error("Ange ett datum.");

      if (kind === "MORTGAGE_PAYMENT") {
        if (!toAccountId) throw new Error("Välj bolån/lån.");
        const principalMinor = kronorToMinorString(principalAmount);
        const interestMinor = kronorToMinorString(interestAmount);
        if (principalMinor == null || BigInt(principalMinor) <= 0n) {
          throw new Error("Ange ett positivt amorteringsbelopp i kronor.");
        }
        if (interestMinor == null || BigInt(interestMinor) < 0n) {
          throw new Error("Ange ett giltigt räntebelopp i kronor.");
        }
        return api.createMortgagePayment({
          householdId: id,
          cashAccountId: accountId,
          mortgageAccountId: toAccountId,
          principalMinor,
          interestMinor,
          occurredOn,
          description: description.trim() || undefined,
        });
      }

      const amountMinor = kronorToMinorString(amount);
      if (amountMinor == null || BigInt(amountMinor) <= 0n) {
        throw new Error("Ange ett positivt belopp i kronor.");
      }

      if (kind === "EXPENSE") {
        return api.createCashExpense({
          householdId: id,
          cashAccountId: accountId,
          amountMinor,
          occurredOn,
          description: description.trim() || undefined,
          categoryId: categoryId || undefined,
          merchantName: merchantName.trim() || undefined,
        });
      }
      if (kind === "INCOME") {
        return api.createCashIncome({
          householdId: id,
          cashAccountId: accountId,
          amountMinor,
          occurredOn,
          description: description.trim() || undefined,
          categoryId: categoryId || undefined,
          merchantName: merchantName.trim() || undefined,
        });
      }
      if (kind === "TRANSFER") {
        if (!toAccountId) throw new Error("Välj mottagarkonto.");
        if (toAccountId === accountId) {
          throw new Error("Från- och till-konto måste vara olika.");
        }
        return api.createInternalTransfer({
          householdId: id,
          fromAccountId: accountId,
          toAccountId,
          amountMinor,
          occurredOn,
          description: description.trim() || undefined,
        });
      }
      if (kind === "REFUND") {
        return api.createCashRefund({
          householdId: id,
          cashAccountId: accountId,
          amountMinor,
          occurredOn,
          description: description.trim() || undefined,
        });
      }
      if (kind === "CREDIT_CARD_PURCHASE") {
        return api.createCreditCardPurchase({
          householdId: id,
          creditCardAccountId: accountId,
          amountMinor,
          occurredOn,
          description: description.trim() || undefined,
        });
      }
      if (kind === "CREDIT_CARD_PAYMENT") {
        if (!toAccountId) throw new Error("Välj kreditkort.");
        return api.createCreditCardPayment({
          householdId: id,
          cashAccountId: accountId,
          creditCardAccountId: toAccountId,
          amountMinor,
          occurredOn,
          description: description.trim() || undefined,
        });
      }
      // INVESTMENT_TRANSFER
      if (!toAccountId) throw new Error("Välj investeringskonto.");
      return api.createInvestmentTransfer({
        householdId: id,
        cashAccountId: accountId,
        investmentAccountId: toAccountId,
        amountMinor,
        occurredOn,
        description: description.trim() || undefined,
      });
    },
    onSuccess: async () => {
      setFormError(null);
      resetForm();
      await invalidateAfterMutation();
      onDone();
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : "Kunde inte skapa händelsen.");
    },
  });

  const principalMinorPreview = kronorToMinorString(principalAmount || "0") ?? "0";
  const interestMinorPreview = kronorToMinorString(interestAmount || "0") ?? "0";
  const totalPreview = (() => {
    try {
      return formatMoney(
        moneyFromJson({
          amountMinor: (
            BigInt(principalMinorPreview) + BigInt(interestMinorPreview)
          ).toString(),
          currency: "SEK",
        }),
        "sv-SE",
      );
    } catch {
      return null;
    }
  })();

  return (
    <div className="space-y-4 rounded-[16px] bg-surface-elevated p-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Typ av händelse">
        {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => {
              setKind(k);
              setFormError(null);
              setAccountId("");
              resetForm();
            }}
            className={`min-h-11 rounded-[12px] px-4 text-sm font-medium ${
              kind === k
                ? "bg-accent text-white"
                : "border border-border bg-surface text-text-secondary"
            }`}
          >
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>

      {kind === "TRANSFER" ? (
        <p className="text-sm text-text-secondary">
          Intern överföring — räknas inte som utgift.
        </p>
      ) : null}
      {kind === "REFUND" ? (
        <p className="text-sm text-text-secondary">
          Registrerar en kontant återbetalning som minskar periodens utgift — inte
          som lön/inkomst.
        </p>
      ) : null}
      {kind === "CREDIT_CARD_PURCHASE" ? (
        <p className="text-sm text-text-secondary">
          Registrerar ett köp på kreditkort — ökar kreditkortsskulden.
        </p>
      ) : null}
      {kind === "CREDIT_CARD_PAYMENT" ? (
        <p className="text-sm text-text-secondary">
          Betalar av kreditkortsskuld från ett kontantkonto.
        </p>
      ) : null}
      {kind === "MORTGAGE_PAYMENT" ? (
        <p className="text-sm text-text-secondary">
          Delar upp betalningen i amortering (minskar skulden) och ränta (kostnad).
        </p>
      ) : null}
      {kind === "INVESTMENT_TRANSFER" ? (
        <p className="text-sm text-text-secondary">
          Överför kontanter till ett investeringskonto — räknas inte som utgift.
        </p>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void createMutation.mutate();
        }}
        className="grid gap-3 md:grid-cols-2"
      >
        <label className="block text-sm">
          <span className="text-text-muted">{primaryLabel}</span>
          <select
            required
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm"
          >
            <option value="">Välj konto</option>
            {primaryAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        {isTwoAccountKind ? (
          <label className="block text-sm">
            <span className="text-text-muted">{secondaryLabel}</span>
            <select
              required
              value={toAccountId}
              onChange={(e) => setToAccountId(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm"
            >
              <option value="">Välj konto</option>
              {secondaryAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {isMortgage ? (
          <>
            <label className="block text-sm">
              <span className="text-text-muted">Amortering (kr)</span>
              <input
                required
                inputMode="decimal"
                value={principalAmount}
                onChange={(e) => setPrincipalAmount(e.target.value)}
                placeholder="0"
                className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm tabular-nums"
              />
            </label>
            <label className="block text-sm">
              <span className="text-text-muted">Ränta (kr)</span>
              <input
                required
                inputMode="decimal"
                value={interestAmount}
                onChange={(e) => setInterestAmount(e.target.value)}
                placeholder="0"
                className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm tabular-nums"
              />
            </label>
            {totalPreview ? (
              <p className="text-sm text-text-secondary md:col-span-2">
                Totalt betalningsbelopp: <span className="tabular-nums">{totalPreview}</span>
              </p>
            ) : null}
          </>
        ) : (
          <label className="block text-sm">
            <span className="text-text-muted">Belopp (kr)</span>
            <input
              required
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm tabular-nums"
            />
          </label>
        )}

        <label className="block text-sm">
          <span className="text-text-muted">Datum</span>
          <input
            required
            type="date"
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm"
          />
        </label>

        <label className="block text-sm md:col-span-2">
          <span className="text-text-muted">Beskrivning (valfritt)</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm"
          />
        </label>

        {kind === "EXPENSE" || kind === "INCOME" ? (
          <>
            <label className="block text-sm">
              <span className="text-text-muted">Kategori (valfritt)</span>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm"
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
              <span className="text-text-muted">Butik/motpart (valfritt)</span>
              <input
                value={merchantName}
                onChange={(e) => setMerchantName(e.target.value)}
                className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm"
              />
            </label>
          </>
        ) : null}

        {formError ? (
          <p className="text-sm text-negative md:col-span-2" role="alert">
            {formError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={createMutation.isPending}
          className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-white disabled:opacity-60 md:col-span-2"
        >
          {createMutation.isPending ? "Sparar…" : `Skapa ${KIND_LABELS[kind].toLowerCase()}`}
        </button>
      </form>
    </div>
  );
}
