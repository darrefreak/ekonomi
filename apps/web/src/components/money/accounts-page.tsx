"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AccountDto } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { useHouseholdId } from "@/lib/use-household-id";
import { queryKeys } from "@/lib/query-keys";
import { kronorToMinorString } from "@/lib/money-input";
import { useSubmissionKey } from "@/lib/idempotency";
import {
  ACCOUNT_TYPES,
  CURRENCIES,
  accountTypeLabel,
} from "@/lib/account-labels";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

type FormState = {
  name: string;
  accountType: (typeof ACCOUNT_TYPES)[number];
  currency: (typeof CURRENCIES)[number];
  isShared: boolean;
  ownerMemberId: string;
  provider: string;
  openingBalance: string;
  creditLimit: string;
};

const INITIAL_FORM: FormState = {
  name: "",
  accountType: "CHECKING",
  currency: "SEK",
  isShared: true,
  ownerMemberId: "",
  provider: "",
  openingBalance: "0",
  creditLimit: "",
};

export function AccountsPage() {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const submissionKey = useSubmissionKey();

  const accountsQuery = useQuery({
    queryKey: householdId
      ? queryKeys.accounts.all(householdId, includeArchived)
      : ["accounts", "pending"],
    queryFn: () => api.listAccounts(householdId!, { includeArchived }),
    enabled: Boolean(householdId),
  });

  const settingsQuery = useQuery({
    queryKey: householdId ? queryKeys.settings.all(householdId) : ["settings", "pending"],
    queryFn: () => api.getSettings(householdId!),
    enabled: Boolean(householdId),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const id = await ensureHouseholdSession();
      if (!form.name.trim()) {
        throw new Error("Ange ett kontonamn.");
      }
      const openingBalanceMinor = kronorToMinorString(form.openingBalance || "0");
      if (openingBalanceMinor == null || BigInt(openingBalanceMinor) < 0n) {
        throw new Error("Öppningssaldo måste vara ett giltigt belopp i kronor (≥ 0).");
      }
      let creditLimitMinor: string | null | undefined;
      if (form.accountType === "CREDIT_CARD") {
        if (!form.creditLimit.trim()) {
          throw new Error("Ange en kreditgräns för kreditkort.");
        }
        creditLimitMinor = kronorToMinorString(form.creditLimit);
        if (creditLimitMinor == null || BigInt(creditLimitMinor) < 0n) {
          throw new Error("Kreditgränsen måste vara ett giltigt belopp i kronor (≥ 0).");
        }
      }
      return api.createAccount({
        householdId: id,
        name: form.name.trim(),
        accountType: form.accountType,
        currency: form.currency,
        provider: form.provider.trim() || null,
        isShared: form.isShared,
        ownerMemberId: form.isShared ? null : form.ownerMemberId || null,
        openingBalanceMinor,
        creditLimitMinor,
      }, { idempotencyKey: submissionKey.current() });
    },
    onSuccess: async () => {
      // The intent succeeded; the next submission is a genuinely new account.
      submissionKey.renew();
      setForm(INITIAL_FORM);
      setFormError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounts", householdId] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all(householdId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.netWorth.all(householdId!) }),
      ]);
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : "Kunde inte skapa konto.");
    },
  });

  const items = accountsQuery.data?.items ?? [];
  const members = settingsQuery.data?.members ?? [];

  if (!householdId || (accountsQuery.isLoading && items.length === 0)) {
    return <LoadingState label="Hämtar konton…" />;
  }
  if (accountsQuery.isError && items.length === 0) {
    return (
      <ErrorState
        title="Kunde inte hämta konton"
        description={
          accountsQuery.error instanceof Error
            ? accountsQuery.error.message
            : "Något gick fel"
        }
        onRetry={() => void accountsQuery.refetch()}
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
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void createMutation.mutate();
        }}
        className="space-y-4 rounded-[16px] bg-surface-elevated p-4"
      >
        <h2 className="text-sm font-medium text-text-secondary">Nytt konto</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-text-muted">Namn</span>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="t.ex. Löntagarkonto"
              className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-text-muted">Typ</span>
            <select
              value={form.accountType}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  accountType: e.target.value as (typeof ACCOUNT_TYPES)[number],
                }))
              }
              className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm"
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {accountTypeLabel(t)}
                </option>
              ))}
            </select>
          </label>
          {/*
            Totals are calculated in the household's own currency and there is
            no exchange-rate engine yet, so offering other currencies here would
            promise something the figures cannot deliver.
          */}
          <div className="block text-sm">
            <span className="text-text-muted">Valuta</span>
            <div
              data-testid="account-currency"
              className="mt-1 flex min-h-11 w-full items-center rounded-[12px] border border-border bg-surface-muted px-3 text-sm text-text"
            >
              {form.currency}
            </div>
            <p className="mt-1 text-xs text-text-muted">
              Hushållet räknar sina summor i {form.currency}. Fler valutor kommer
              senare.
            </p>
          </div>
          <label className="block text-sm">
            <span className="text-text-muted">Provider (valfritt)</span>
            <input
              value={form.provider}
              onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
              placeholder="t.ex. SEB, Avanza"
              className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-text-muted">Öppningssaldo (kr)</span>
            <input
              inputMode="decimal"
              value={form.openingBalance}
              onChange={(e) =>
                setForm((f) => ({ ...f, openingBalance: e.target.value }))
              }
              placeholder="0"
              className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm tabular-nums"
            />
          </label>
          {form.accountType === "CREDIT_CARD" ? (
            <label className="block text-sm">
              <span className="text-text-muted">Kreditgräns (kr)</span>
              <input
                inputMode="decimal"
                required
                value={form.creditLimit}
                onChange={(e) =>
                  setForm((f) => ({ ...f, creditLimit: e.target.value }))
                }
                placeholder="15000"
                className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm tabular-nums"
              />
            </label>
          ) : null}
        </div>

        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isShared}
            onChange={(e) =>
              setForm((f) => ({ ...f, isShared: e.target.checked, ownerMemberId: "" }))
            }
          />
          Delat konto (hela hushållet)
        </label>

        {!form.isShared ? (
          <label className="block text-sm">
            <span className="text-text-muted">Ägare (valfritt)</span>
            <select
              value={form.ownerMemberId}
              onChange={(e) =>
                setForm((f) => ({ ...f, ownerMemberId: e.target.value }))
              }
              className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm"
            >
              <option value="">Ingen specifik ägare</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {formError ? (
          <p className="text-sm text-negative" role="alert">
            {formError}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-white disabled:opacity-60"
        >
          {createMutation.isPending ? "Skapar…" : "Skapa konto"}
        </button>
      </form>

      <label className="flex min-h-11 items-center gap-2 text-sm text-text-secondary">
        <input
          type="checkbox"
          checked={includeArchived}
          onChange={(e) => setIncludeArchived(e.target.checked)}
        />
        Visa arkiverade konton
      </label>

      {items.length === 0 ? (
        <EmptyState
          title="Inga konton ännu"
          description="Skapa ett konto ovan för att börja följa saldon och transaktioner."
        />
      ) : (
        <ul className="divide-y divide-border rounded-[16px] bg-surface-elevated shadow-[var(--ffos-shadow-soft)]">
          {items.map((account) => (
            <AccountRow key={account.id} account={account} members={members} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AccountRow({
  account,
  members,
}: {
  account: AccountDto;
  members: Array<{ id: string; displayName: string }>;
}) {
  const owner = account.ownerMemberId
    ? members.find((m) => m.id === account.ownerMemberId)?.displayName
    : null;
  return (
    <li>
      <Link
        href={`/accounts/${account.id}`}
        className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted/60"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{account.name}</p>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                account.isShared
                  ? "bg-accent/10 text-accent"
                  : "bg-surface-muted text-text-secondary"
              }`}
            >
              {account.isShared ? "Delat" : "Personligt"}
            </span>
            {account.archivedAt ? (
              <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] text-text-muted">
                Arkiverat
              </span>
            ) : null}
          </div>
          <p className="text-xs text-text-muted">
            {accountTypeLabel(account.accountType)}
            {account.provider ? ` · ${account.provider}` : ""}
            {owner ? ` · ${owner}` : ""}
            {account.freshnessLabel ? ` · ${account.freshnessLabel}` : ""}
          </p>
        </div>
        <MoneyValue
          value={account.currentBalance}
          className="shrink-0 text-text-primary"
        />
      </Link>
    </li>
  );
}
