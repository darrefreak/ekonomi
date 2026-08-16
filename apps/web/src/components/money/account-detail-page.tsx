"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { useHouseholdId } from "@/lib/use-household-id";
import { queryKeys } from "@/lib/query-keys";
import { kronorToMinorString, minorToKronorInput } from "@/lib/money-input";
import { accountTypeLabel } from "@/lib/account-labels";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { describeError } from "@/lib/error-message";

export function AccountDetailPage({ accountId }: { accountId: string }) {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  const router = useRouter();

  const detailQuery = useQuery({
    queryKey: householdId
      ? queryKeys.accounts.detail(householdId, accountId)
      : ["accounts", "detail", "pending"],
    queryFn: () => api.getAccount(householdId!, accountId),
    enabled: Boolean(householdId),
  });

  const settingsQuery = useQuery({
    queryKey: householdId ? queryKeys.settings.all(householdId) : ["settings", "pending"],
    queryFn: () => api.getSettings(householdId!),
    enabled: Boolean(householdId),
  });

  const data = detailQuery.data;
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("");
  const [isShared, setIsShared] = useState(true);
  const [ownerMemberId, setOwnerMemberId] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  /** What the account already claims, so an unchanged field sends nothing. */
  const [originalOpening, setOriginalOpening] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setProvider(data.provider ?? "");
    setIsShared(data.isShared);
    setOwnerMemberId(data.ownerMemberId ?? "");
    setCreditLimit(
      data.creditLimit ? minorToKronorInput(data.creditLimit.amountMinor) : "",
    );
    const opening = data.openingBalance
      ? minorToKronorInput(data.openingBalance.amountMinor)
      : "0";
    setOpeningBalance(opening);
    setOriginalOpening(opening);
  }, [data]);

  const invalidateAll = async () => {
    if (!householdId) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["accounts", householdId] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all(householdId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.netWorth.all(householdId) }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error("Kontot är inte laddat.");
      if (!name.trim()) throw new Error("Namn kan inte vara tomt.");
      const id = await ensureHouseholdSession();
      let creditLimitMinor: string | null | undefined;
      if (data.accountType === "CREDIT_CARD") {
        if (creditLimit.trim()) {
          creditLimitMinor = kronorToMinorString(creditLimit);
          if (creditLimitMinor == null || BigInt(creditLimitMinor) < 0n) {
            throw new Error("Kreditgränsen måste vara ett giltigt belopp i kronor (≥ 0).");
          }
        } else {
          creditLimitMinor = null;
        }
      }
      // Only sent when it actually changed: it is a ledger-affecting correction,
      // not something to rewrite every time the name is edited.
      let openingBalanceMinor: string | undefined;
      const openingTrimmed = openingBalance.trim();
      if (openingTrimmed && openingTrimmed !== originalOpening) {
        const parsed = kronorToMinorString(openingTrimmed);
        if (parsed == null || BigInt(parsed) < 0n) {
          throw new Error("Ingående saldo måste vara ett giltigt belopp i kronor (≥ 0).");
        }
        openingBalanceMinor = parsed;
      }
      return api.updateAccount(accountId, {
        householdId: id,
        name: name.trim(),
        provider: provider.trim() || null,
        isShared,
        ownerMemberId: isShared ? null : ownerMemberId || null,
        creditLimitMinor,
        openingBalanceMinor,
      });
    },
    onSuccess: async () => {
      setActionError(null);
      await Promise.all([
        invalidateAll(),
        householdId
          ? queryClient.invalidateQueries({
              queryKey: queryKeys.accounts.detail(householdId, accountId),
            })
          : Promise.resolve(),
      ]);
    },
    onError: (err: unknown) => {
      setActionError(describeError(err, "Kunde inte spara ändringar."));
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      const id = await ensureHouseholdSession();
      return api.archiveAccount(id, accountId);
    },
    onSuccess: async () => {
      await invalidateAll();
      router.push("/accounts");
    },
    onError: (err: unknown) => {
      setActionError(describeError(err, "Kunde inte arkivera kontot."));
    },
  });

  if (!householdId || detailQuery.isLoading) return <LoadingState label="Hämtar konto…" />;
  if (detailQuery.isError || !data) {
    return (
      <ErrorState
        title="Kunde inte hämta kontot"
        description={describeError(detailQuery.error, "Något gick fel")}
        onRetry={() => void detailQuery.refetch()}
      />
    );
  }

  const members = settingsQuery.data?.members ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/accounts" className="text-sm text-accent">
          ← Konton
        </Link>
        <div className="mt-2 flex items-center gap-2">
          <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
            {data.name}
          </h1>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              data.isShared
                ? "bg-accent/10 text-accent"
                : "bg-surface-muted text-text-secondary"
            }`}
          >
            {data.isShared ? "Delat" : "Personligt"}
          </span>
        </div>
        <p className="mt-2 text-sm text-text-secondary">
          {accountTypeLabel(data.accountType)}
          {data.provider ? ` · ${data.provider}` : ""}
          {` · ${data.connectionStatus}`}
          {data.freshnessLabel ? ` · ${data.freshnessLabel}` : ""}
          {data.archivedAt ? " · Arkiverat" : ""}
        </p>
      </div>

      <section className="rounded-[16px] bg-surface-elevated p-5">
        <p className="text-sm text-text-secondary">
          Bokfört saldo (ändras via transaktioner)
        </p>
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
          <span className="text-text-secondary">Bank eller källa</span>
          <input
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3"
          />
        </label>

        <label className="block text-sm">
          <span className="text-text-secondary">Ingående saldo (kr)</span>
          <input
            inputMode="decimal"
            value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 tabular-nums"
          />
          <span className="mt-1 block text-xs text-text-muted">
            Vad kontot innehöll innan den första bokförda transaktionen. Har du
            importerat ett kontoutdrag som börjar mitt i kontots historik ska det
            här vara utdragets startsaldo — annars blir varje transaktion rätt men
            totalsumman fel med skillnaden.
          </span>
        </label>

        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isShared}
            onChange={(e) => setIsShared(e.target.checked)}
          />
          Delat konto (hela hushållet)
        </label>

        {!isShared ? (
          <label className="block text-sm">
            <span className="text-text-secondary">Ägare (valfritt)</span>
            <select
              value={ownerMemberId}
              onChange={(e) => setOwnerMemberId(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3"
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

        {data.accountType === "CREDIT_CARD" ? (
          <label className="block text-sm">
            <span className="text-text-secondary">Kreditgräns (kr)</span>
            <input
              inputMode="decimal"
              value={creditLimit}
              onChange={(e) => setCreditLimit(e.target.value)}
              placeholder="15000"
              className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 tabular-nums"
            />
          </label>
        ) : null}

        {actionError ? (
          <p className="text-sm text-negative" role="alert">
            {actionError}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={saveMutation.isPending}
            onClick={() => void saveMutation.mutate()}
            className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-on-accent disabled:opacity-60"
          >
            {saveMutation.isPending ? "Sparar…" : "Spara"}
          </button>
          {!data.archivedAt ? (
            <button
              type="button"
              disabled={archiveMutation.isPending}
              onClick={() => {
                if (window.confirm(`Arkivera kontot "${data.name}"? Historiken bevaras.`)) {
                  void archiveMutation.mutate();
                }
              }}
              className="min-h-11 rounded-[12px] border border-border-strong px-4 text-sm disabled:opacity-60"
            >
              {archiveMutation.isPending ? "Arkiverar…" : "Arkivera"}
            </button>
          ) : null}
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
