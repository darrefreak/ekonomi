"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ExpectedTransactionItem,
  RecurringStream,
  VerifyRecurringStreamInput,
} from "@ffos/schemas";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { ensureHouseholdSession } from "@/lib/session";
import { describeError } from "@/lib/error-message";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

/**
 * The recurring surface: subscriptions, recurring bills, recurring income,
 * price intelligence and upcoming expected transactions.
 *
 * Every figure comes from persisted recurring streams the deterministic
 * detector built from the household's own transaction clusters. Subscription
 * totals never include utilities or mortgages, and income is never netted
 * against costs.
 */

const CADENCE_LABELS: Record<string, string> = {
  WEEKLY: "varje vecka",
  BIWEEKLY: "varannan vecka",
  EVERY_4_WEEKS: "var 4:e vecka",
  MONTHLY: "månadsvis",
  QUARTERLY: "kvartalsvis",
  SEMIANNUAL: "halvårsvis",
  ANNUAL: "årligen",
  YEARLY: "årligen",
  VARIABLE_RECURRING: "återkommande, varierande",
};

const TYPE_LABELS: Record<string, string> = {
  SUBSCRIPTION: "Abonnemang",
  UTILITY_BILL: "El & drift",
  INSURANCE: "Försäkring",
  MORTGAGE: "Bolån",
  LOAN_PAYMENT: "Lån",
  SALARY: "Lön",
  BENEFIT: "Bidrag/ersättning",
  TELECOM: "Telefoni/bredband",
  MEMBERSHIP: "Medlemskap",
  CHILDCARE: "Barnomsorg",
  ANNUAL_BILL: "Årsräkning",
  VARIABLE_RECURRING: "Varierande återkommande",
  OTHER_RECURRING: "Övrigt återkommande",
  UNKNOWN_RECURRING: "Okänd återkommande",
};

function formatMinor(minor: string | null | undefined, currency: string): string {
  if (minor === null || minor === undefined) return "–";
  const value = Number(BigInt(minor)) / 100;
  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRange(low: string, high: string, currency: string): string {
  if (low === high) return formatMinor(low, currency);
  return `${formatMinor(low, currency)} – ${formatMinor(high, currency)}`;
}

function formatDateRange(from: string, to: string): string {
  if (from === to) return from;
  return `${from} – ${to}`;
}

export function SubscriptionsPage() {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    ensureHouseholdSession()
      .then(setHouseholdId)
      .catch((err: Error) => setSessionError(err.message));
  }, []);

  if (sessionError) {
    return <ErrorState title="Kunde inte hämta abonnemang" description={sessionError} />;
  }
  if (!householdId) return <LoadingState label="Hämtar abonnemang…" />;
  return <RecurringSurface householdId={householdId} />;
}

function RecurringSurface({ householdId }: { householdId: string }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const overviewQuery = useQuery({
    queryKey: queryKeys.intelligence.recurring(householdId),
    queryFn: () => api.getRecurringOverview(householdId),
  });
  const expectedQuery = useQuery({
    queryKey: queryKeys.intelligence.expected(householdId),
    queryFn: () => api.getExpectedTransactions(householdId),
  });

  const verifyMutation = useMutation({
    mutationFn: (input: { recurringId: string } & VerifyRecurringStreamInput) =>
      api.verifyRecurringStream(input.recurringId, {
        householdId: input.householdId,
        status: input.status,
        isSubscription: input.isSubscription,
      }),
    onMutate: (input) => setBusyId(input.recurringId),
    onSuccess: async (data) => {
      setError(null);
      queryClient.setQueryData(queryKeys.intelligence.recurring(householdId), data);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.intelligence.expected(householdId),
      });
    },
    onError: (err) => setError(describeError(err, "Kunde inte spara")),
    onSettled: () => setBusyId(null),
  });

  if (overviewQuery.isPending) return <LoadingState label="Hämtar abonnemang…" />;
  if (overviewQuery.isError || !overviewQuery.data) {
    return (
      <ErrorState
        title="Kunde inte hämta abonnemang"
        description={describeError(overviewQuery.error, "Ingen data")}
        onRetry={() => void overviewQuery.refetch()}
      />
    );
  }

  const overview = overviewQuery.data;
  const expected = expectedQuery.data ?? null;
  const subscriptionGroup = overview.groups.find((group) => group.key === "subscriptions");
  const subscriptions = subscriptionGroup?.streams ?? [];
  const verify = (recurringId: string, input: Omit<VerifyRecurringStreamInput, "householdId">) =>
    verifyMutation.mutate({ recurringId, householdId, ...input });

  // "Nytt återkommande": patterns first observed in the last 90 days that the
  // user has not yet confirmed — new financial commitments deserve a look.
  const newSince = new Date();
  newSince.setDate(newSince.getDate() - 90);
  const newSinceIso = newSince.toISOString().slice(0, 10);
  const newStreams = overview.groups
    .flatMap((group) => group.streams)
    .filter(
      (stream) =>
        stream.firstSeenOn !== null &&
        stream.firstSeenOn >= newSinceIso &&
        !stream.userVerified &&
        stream.status !== "DISMISSED" &&
        stream.recurringType !== "SALARY",
    );

  return (
    <div className="space-y-6" data-testid="recurring-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
            Abonnemang & återkommande
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Upptäckta återkommande mönster från hushållets egna transaktioner · per{" "}
            {overview.asOf}
          </p>
        </div>
        <a
          href="/calendar"
          className="min-h-11 shrink-0 text-sm font-medium text-accent"
        >
          Visa i kalendern →
        </a>
      </div>

      {error ? (
        <p className="text-sm text-warning" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="recurring-totals">
        <TotalCard
          label="Abonnemang / månad"
          value={formatMinor(overview.totals.subscriptionsMonthlyMinor, "SEK")}
          detail={`${formatMinor(overview.totals.subscriptionsAnnualMinor, "SEK")} per år`}
        />
        <TotalCard
          label="Återkommande utgifter / månad"
          value={formatMinor(overview.totals.recurringExpensesMonthlyMinor, "SEK")}
          detail={`${formatMinor(overview.totals.recurringExpensesAnnualMinor, "SEK")} per år`}
        />
        <TotalCard
          label="Återkommande inkomster / månad"
          value={formatMinor(overview.totals.recurringIncomeMonthlyMinor, "SEK")}
          detail={`${formatMinor(overview.totals.recurringIncomeAnnualMinor, "SEK")} per år`}
        />
        <TotalCard
          label="Återkommande mönster"
          value={String(overview.counts.streams)}
          detail={`${overview.counts.subscriptions} abonnemang · ${overview.counts.incomeStreams} inkomster`}
        />
      </div>

      {overview.totals.variableStreamsExcluded > 0 ? (
        <p className="text-xs text-text-muted">
          {overview.totals.variableStreamsExcluded} mönster med varierande schema ingår
          inte i månadssummorna, eftersom de saknar fast period.
        </p>
      ) : null}

      {overview.priceInsights.increasedStreams > 0 ? (
        <section
          className="rounded-[16px] border border-warning/40 bg-warning/10 p-5"
          data-testid="price-insights"
        >
          <h2 className="text-sm font-medium">
            Har blivit dyrare —{" "}
            {overview.priceInsights.increasedStreams === 1
              ? "ett återkommande belopp höjt senaste 12 månaderna"
              : `${overview.priceInsights.increasedStreams} återkommande belopp höjda senaste 12 månaderna`}
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Samlad årlig ökning:{" "}
            <strong>{formatMinor(overview.priceInsights.annualIncreaseMinor, "SEK")}</strong>
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {overview.priceInsights.items.map((item) => (
              <li key={`${item.id}-${item.changedOn}`}>
                {item.name}: {formatMinor(item.fromMinor, "SEK")} →{" "}
                {formatMinor(item.toMinor, "SEK")}
                {item.percentChange !== null ? ` (${item.percentChange > 0 ? "+" : ""}${item.percentChange} %)` : ""}
                {" · "}
                {formatMinor(item.annualImpactMinor, "SEK")}/år · från {item.changedOn}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {newStreams.length > 0 ? (
        <section
          className="overflow-hidden rounded-[16px] bg-surface-elevated"
          data-testid="new-recurring"
        >
          <h2 className="border-b border-border px-5 py-3 text-sm text-text-secondary">
            Nytt återkommande ({newStreams.length})
          </h2>
          <ul className="divide-y divide-border">
            {newStreams.map((stream) => (
              <li key={stream.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {stream.merchantName ?? stream.name}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      Först sedd {stream.firstSeenOn} ·{" "}
                      {CADENCE_LABELS[stream.cadence] ?? stream.cadence.toLowerCase()}
                    </p>
                  </div>
                  <p className="text-right text-sm tabular-nums">
                    {stream.monthlyEquivalentMinor
                      ? `${formatMinor(stream.monthlyEquivalentMinor, stream.currency)}/mån`
                      : formatMinor(stream.currentAmountMinor, stream.currency)}
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <ActionButton
                    busy={busyId === stream.id}
                    onClick={() => verify(stream.id, { status: "CONFIRMED" })}
                  >
                    Stämmer
                  </ActionButton>
                  <ActionButton
                    busy={busyId === stream.id}
                    onClick={() => verify(stream.id, { status: "DISMISSED" })}
                  >
                    Inte återkommande
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {overview.review.length > 0 ? (
        <section
          className="overflow-hidden rounded-[16px] bg-surface-elevated"
          data-testid="recurring-review"
        >
          <h2 className="border-b border-border px-5 py-3 text-sm text-text-secondary">
            Osäkra mönster att granska ({overview.review.length})
          </h2>
          <ul className="divide-y divide-border">
            {overview.review.map((item) => (
              <li key={item.recurringId} className="px-5 py-4">
                <p className="text-sm">{item.question}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {item.occurrenceCount} förekomster ·{" "}
                  {CADENCE_LABELS[item.cadence] ?? item.cadence.toLowerCase()} · median{" "}
                  {formatMinor(item.medianAmountMinor, item.currency)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.reviewType === "POSSIBLE_SUBSCRIPTION" ? (
                    <>
                      <ActionButton
                        busy={busyId === item.recurringId}
                        onClick={() =>
                          verify(item.recurringId, {
                            status: "CONFIRMED",
                            isSubscription: true,
                          })
                        }
                      >
                        Ja, abonnemang
                      </ActionButton>
                      <ActionButton
                        busy={busyId === item.recurringId}
                        onClick={() =>
                          verify(item.recurringId, {
                            status: "CONFIRMED",
                            isSubscription: false,
                          })
                        }
                      >
                        Nej, men återkommande
                      </ActionButton>
                    </>
                  ) : (
                    <>
                      <ActionButton
                        busy={busyId === item.recurringId}
                        onClick={() => verify(item.recurringId, { status: "CONFIRMED" })}
                      >
                        Ja, återkommande
                      </ActionButton>
                      <ActionButton
                        busy={busyId === item.recurringId}
                        onClick={() => verify(item.recurringId, { status: "DISMISSED" })}
                      >
                        Inte återkommande
                      </ActionButton>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        className="overflow-hidden rounded-[16px] bg-surface-elevated"
        data-testid="subscriptions-section"
      >
        <h2 className="border-b border-border px-5 py-3 text-sm text-text-secondary">
          Abonnemang ({subscriptions.length})
        </h2>
        {subscriptions.length === 0 ? (
          <p className="px-5 py-6 text-sm text-text-muted">
            Inga abonnemang har identifierats ännu. Kör analysen under Importer, eller
            granska mönstren nedan.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {subscriptions.map((stream) => (
              <SubscriptionCard
                key={stream.id}
                stream={stream}
                busy={busyId === stream.id}
                onVerify={(input) => verify(stream.id, input)}
              />
            ))}
          </ul>
        )}
      </section>

      {expected ? <ExpectedSection expected={expected} /> : null}

      <section
        className="overflow-hidden rounded-[16px] bg-surface-elevated"
        data-testid="recurring-overview"
      >
        <h2 className="border-b border-border px-5 py-3 text-sm text-text-secondary">
          Alla återkommande mönster
        </h2>
        {overview.groups.filter((group) => group.key !== "subscriptions").length === 0 &&
        subscriptions.length === 0 ? (
          <p className="px-5 py-6 text-sm text-text-muted">
            Inga återkommande mönster ännu.
          </p>
        ) : (
          overview.groups.map((group) => (
            <div key={group.key} data-testid={`recurring-group-${group.key}`}>
              <h3 className="border-b border-border bg-surface px-5 py-2 text-xs uppercase tracking-wide text-text-muted">
                {group.label}
              </h3>
              <ul className="divide-y divide-border">
                {group.streams.map((stream) => (
                  <RecurringRow
                    key={stream.id}
                    stream={stream}
                    busy={busyId === stream.id}
                    onVerify={(input) => verify(stream.id, input)}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function TotalCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <section className="rounded-[16px] bg-surface-elevated p-5">
      <p className="text-sm text-text-secondary">{label}</p>
      <div className="mt-2 text-xl">{value}</div>
      <p className="mt-1 text-xs text-text-muted">{detail}</p>
    </section>
  );
}

function ActionButton({
  busy,
  onClick,
  children,
}: {
  busy: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="min-h-10 rounded-[12px] border border-border-strong px-3 text-xs disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number | null }) {
  if (confidence === null) return null;
  const percent = Math.round(confidence * 100);
  const tone =
    percent >= 75 ? "text-positive" : percent >= 60 ? "text-text-secondary" : "text-warning";
  return (
    <span className={`text-xs ${tone}`}>
      {percent >= 75 ? "hög" : percent >= 60 ? "medel" : "låg"} säkerhet ({percent} %)
    </span>
  );
}

function SubscriptionCard({
  stream,
  busy,
  onVerify,
}: {
  stream: RecurringStream;
  busy: boolean;
  onVerify: (input: Omit<VerifyRecurringStreamInput, "householdId">) => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const lastChange = stream.priceChanges[stream.priceChanges.length - 1] ?? null;

  return (
    <li className="px-5 py-4" data-testid="subscription-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{stream.merchantName ?? stream.name}</p>
          <p className="mt-1 text-xs text-text-muted">
            {CADENCE_LABELS[stream.cadence] ?? stream.cadence.toLowerCase()} ·{" "}
            {stream.occurrenceCount} debiteringar · senast {stream.lastSeenOn ?? "–"}
          </p>
          <p className="mt-1 text-xs">
            <ConfidenceBadge confidence={stream.confidence} />
            {stream.userVerified ? (
              <span className="ml-2 text-xs text-positive">bekräftad</span>
            ) : null}
          </p>
        </div>
        <div className="text-right text-sm">
          <p>{formatMinor(stream.currentAmountMinor, stream.currency)}</p>
          <p className="mt-1 text-xs text-text-secondary">
            {formatMinor(stream.monthlyEquivalentMinor, stream.currency)}/mån ·{" "}
            {formatMinor(stream.annualMinor, stream.currency)}/år
          </p>
        </div>
      </div>

      {stream.nextExpectedOn ? (
        <p className="mt-2 text-xs text-text-secondary" data-testid="next-expected">
          Nästa väntas: {stream.nextExpectedOn}
        </p>
      ) : null}

      {lastChange ? (
        <p className="mt-1 text-xs text-warning" data-testid="price-change">
          Pris {BigInt(lastChange.differenceMinor) > 0n ? "höjt" : "sänkt"}{" "}
          {formatMinor(lastChange.fromMinor, stream.currency)} →{" "}
          {formatMinor(lastChange.toMinor, stream.currency)}
          {lastChange.percentChange !== null
            ? ` (${lastChange.percentChange > 0 ? "+" : ""}${lastChange.percentChange} %)`
            : ""}{" "}
          från {lastChange.changedOn}
          {stream.annualPriceImpactMinor
            ? ` · ${formatMinor(stream.annualPriceImpactMinor, stream.currency)}/år`
            : ""}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {stream.priceChanges.length > 0 ? (
          <ActionButton busy={false} onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? "Dölj prishistorik" : "Visa prishistorik"}
          </ActionButton>
        ) : null}
        {stream.userMarkedSubscription !== false ? (
          <ActionButton busy={busy} onClick={() => onVerify({ isSubscription: false })}>
            Inte ett abonnemang
          </ActionButton>
        ) : null}
        {!stream.userVerified ? (
          <ActionButton
            busy={busy}
            onClick={() => onVerify({ status: "CONFIRMED", isSubscription: true })}
          >
            Bekräfta abonnemang
          </ActionButton>
        ) : null}
      </div>

      {showHistory ? (
        <ul
          className="mt-3 space-y-1 rounded-[12px] bg-surface p-3 text-xs"
          data-testid="price-history"
        >
          <li>
            Ursprungspris: {formatMinor(stream.originalAmountMinor, stream.currency)}
          </li>
          {stream.priceChanges.map((change) => (
            <li key={change.changedOn}>
              {change.changedOn}: {formatMinor(change.fromMinor, stream.currency)} →{" "}
              {formatMinor(change.toMinor, stream.currency)}
              {change.percentChange !== null
                ? ` (${change.percentChange > 0 ? "+" : ""}${change.percentChange} %)`
                : ""}
            </li>
          ))}
          <li>
            Nuvarande pris: {formatMinor(stream.currentAmountMinor, stream.currency)}
          </li>
        </ul>
      ) : null}
    </li>
  );
}

function RecurringRow({
  stream,
  busy,
  onVerify,
}: {
  stream: RecurringStream;
  busy: boolean;
  onVerify: (input: Omit<VerifyRecurringStreamInput, "householdId">) => void;
}) {
  return (
    <li
      className="flex flex-wrap items-start justify-between gap-3 px-5 py-4"
      data-testid="recurring-row"
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium">{stream.merchantName ?? stream.name}</p>
        <p className="mt-1 text-xs text-text-muted">
          {TYPE_LABELS[stream.recurringType] ?? stream.recurringType} ·{" "}
          {CADENCE_LABELS[stream.cadence] ?? stream.cadence.toLowerCase()} ·{" "}
          {stream.occurrenceCount > 0 ? `${stream.occurrenceCount} förekomster · ` : ""}
          {stream.status === "DISMISSED"
            ? "avvisad"
            : stream.status === "PAUSED"
              ? "pausad"
              : stream.userVerified
                ? "bekräftad"
                : "upptäckt"}
        </p>
        {!stream.amountStable && stream.minAmountMinor && stream.maxAmountMinor ? (
          <p className="mt-1 text-xs text-text-muted">
            Varierar {formatRange(stream.minAmountMinor, stream.maxAmountMinor, stream.currency)}
          </p>
        ) : null}
        {stream.detected && !stream.userVerified && stream.status !== "DISMISSED" ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <ActionButton busy={busy} onClick={() => onVerify({ status: "CONFIRMED" })}>
              Stämmer
            </ActionButton>
            <ActionButton busy={busy} onClick={() => onVerify({ status: "DISMISSED" })}>
              Inte återkommande
            </ActionButton>
          </div>
        ) : null}
      </div>
      <div className="text-right text-sm">
        <p>{formatMinor(stream.currentAmountMinor, stream.currency)}</p>
        <p className="mt-1 text-xs text-text-secondary">
          {stream.monthlyEquivalentMinor
            ? `${formatMinor(stream.monthlyEquivalentMinor, stream.currency)}/mån`
            : "varierande"}
          {stream.annualMinor
            ? ` · ${formatMinor(stream.annualMinor, stream.currency)}/år`
            : ""}
        </p>
      </div>
    </li>
  );
}

function ExpectedSection({
  expected,
}: {
  expected: {
    upcoming: ExpectedTransactionItem[];
    missing: Array<ExpectedTransactionItem & { message: string }>;
  };
}) {
  if (expected.upcoming.length === 0 && expected.missing.length === 0) return null;
  return (
    <section
      className="overflow-hidden rounded-[16px] bg-surface-elevated"
      data-testid="expected-section"
    >
      <h2 className="border-b border-border px-5 py-3 text-sm text-text-secondary">
        Väntade transaktioner
      </h2>
      {expected.missing.length > 0 ? (
        <ul className="divide-y divide-border border-b border-border">
          {expected.missing.map((item) => (
            <li key={item.id} className="px-5 py-3" data-testid="missing-expected">
              <p className="text-sm text-warning">{item.message}</p>
              <p className="mt-1 text-xs text-text-muted">
                Väntades {formatDateRange(item.expectedFrom, item.expectedTo)} ·{" "}
                {formatRange(item.expectedLowMinor, item.expectedHighMinor, item.currency)}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="divide-y divide-border">
        {expected.upcoming.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-start justify-between gap-3 px-5 py-3"
            data-testid="expected-upcoming"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{item.name}</p>
              <p className="mt-1 text-xs text-text-muted">
                Väntas {formatDateRange(item.expectedFrom, item.expectedTo)}
                {item.direction === "INFLOW" ? " · inkomst" : ""}
              </p>
            </div>
            <p className="text-right text-sm">
              {formatRange(item.expectedLowMinor, item.expectedHighMinor, item.currency)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
