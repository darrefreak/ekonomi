"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type {
  DebtDetailResponse,
  DebtPayoffMethod,
  DebtPayoffResponse,
  DebtResponse,
} from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { kronorToMinorString } from "@/lib/money-input";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { describeError } from "@/lib/error-message";

export function DebtPage() {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [data, setData] = useState<DebtResponse | null>(null);
  const [detail, setDetail] = useState<DebtDetailResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const id = await ensureHouseholdSession();
      setHouseholdId(id);
      const debt = await api.getDebt(id);
      setData(debt);
      const firstMortgage =
        debt.items.find((i) => i.accountType === "MORTGAGE") ?? debt.items[0];
      if (firstMortgage) {
        setSelectedId(firstMortgage.id);
      }
    } catch (err) {
      setError(describeError(err, "Något gick fel"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!householdId || !selectedId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    void api
      .getDebtDetail(householdId, selectedId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [householdId, selectedId]);

  if (loading) return <LoadingState label="Hämtar skulder…" />;
  if (error) {
    return (
      <ErrorState
        title="Kunde inte hämta skulder"
        description={error}
        onRetry={() => void load()}
      />
    );
  }
  if (!data) {
    return (
      <EmptyState
        title="Inga skulder"
        description="Lägg till bolån, lån eller kreditkort under Konton."
        actionLabel="Försök igen"
        onAction={() => void load()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Skulder
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Bolån, lån och krediter · amortering och ränta · per {data.asOf}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="Totalt" value={<MoneyValue value={data.totals.outstanding} />} />
        <Stat
          label="Amortering 12 mån"
          value={<MoneyValue value={data.totals.trailingPrincipal} />}
        />
        <Stat
          label="Ränta 12 mån"
          value={<MoneyValue value={data.totals.trailingInterest} />}
        />
      </div>

      <div className="grid gap-3 text-sm md:grid-cols-3">
        <MiniStat label="Bolån" value={<MoneyValue value={data.totals.mortgages} />} />
        <MiniStat label="Lån" value={<MoneyValue value={data.totals.loans} />} />
        <MiniStat
          label="Kreditkort"
          value={<MoneyValue value={data.totals.creditCards} />}
        />
      </div>

      {householdId && data.items.length > 0 ? (
        <PayoffSection householdId={householdId} onDebtChanged={() => void load()} />
      ) : null}

      {data.items.length === 0 ? (
        <EmptyState
          title="Inga skuldkonton"
          description="När bolån eller lån finns visas saldo, ränta och amortering här."
        />
      ) : (
        <section className="overflow-hidden rounded-[16px] bg-surface-elevated">
          <ul className="divide-y divide-border">
            {data.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`flex min-h-14 w-full items-start justify-between gap-3 px-5 py-4 text-left ${
                    selectedId === item.id ? "bg-surface-muted/50" : ""
                  }`}
                >
                  <div>
                    <p className="font-medium text-text-primary">{item.name}</p>
                    <p className="mt-1 text-xs text-text-muted">
                      {item.accountType}
                      {item.provider ? ` · ${item.provider}` : ""}
                      {item.interestRatePercent != null
                        ? ` · ${item.interestRatePercent.toFixed(2)} %`
                        : ""}
                      {item.bindingEndDate
                        ? ` · bundet t.o.m. ${item.bindingEndDate}`
                        : ""}
                    </p>
                    <p className="mt-1 text-xs text-text-secondary">
                      12m amortering <MoneyValue value={item.trailingPrincipal} /> ·
                      ränta <MoneyValue value={item.trailingInterest} />
                    </p>
                  </div>
                  <MoneyValue
                    value={item.outstanding}
                    className="shrink-0 text-text-primary"
                  />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {detailLoading ? (
        <LoadingState label="Hämtar skulddetalj…" />
      ) : detail ? (
        <section className="space-y-4 rounded-[16px] bg-surface-elevated p-5">
          <div>
            <h2 className="text-sm font-medium text-text-secondary">
              {detail.item.name}
            </h2>
            <p className="mt-1 text-xs text-text-muted">
              Principal vs ränta (senaste 12 månaderna)
            </p>
          </div>
          <dl className="grid gap-3 text-sm md:grid-cols-4">
            <div>
              <dt className="text-text-secondary">Saldo</dt>
              <dd>
                <MoneyValue value={detail.item.outstanding} />
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">Est. ränta / mån</dt>
              <dd>
                {detail.item.estimatedMonthlyInterest ? (
                  <MoneyValue value={detail.item.estimatedMonthlyInterest} />
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">Amortering 12m</dt>
              <dd>
                <MoneyValue value={detail.item.trailingPrincipal} />
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">Ränta 12m</dt>
              <dd>
                <MoneyValue value={detail.item.trailingInterest} />
              </dd>
            </div>
          </dl>

          {detail.item.rateScenarios.length > 0 ? (
            <div>
              <h3 className="text-sm font-medium text-text-secondary">
                Räntescenarios
              </h3>
              <p className="mt-1 text-xs text-text-muted">
                Uppskattad månadskostnad om räntan stiger (icke-destruktivt).
              </p>
              <ul className="mt-3 divide-y divide-border rounded-[12px] border border-border">
                {detail.item.rateScenarios.map((s) => (
                  <li
                    key={s.rateDeltaBps}
                    className="flex justify-between gap-3 px-4 py-3 text-sm"
                  >
                    <span>{s.label}</span>
                    <span className="text-right">
                      <MoneyValue value={s.projectedMonthlyInterest} />
                      <span className="mt-1 block text-xs text-text-muted">
                        Δ <MoneyValue value={s.monthlyInterestDelta} signed /> / mån
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <h3 className="text-sm font-medium text-text-secondary">
              Betalningshistorik
            </h3>
            {detail.payments.length === 0 ? (
              <p className="mt-2 text-sm text-text-muted">
                Inga amorterings-/ränteposter kopplade till kontot.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border rounded-[12px] border border-border">
                {detail.payments.map((p) => (
                  <li
                    key={p.id}
                    className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[6rem_1fr_auto]"
                  >
                    <span className="text-text-muted">{p.occurredOn}</span>
                    <span>
                      {p.description ?? "Betalning"}
                      <span className="mt-1 block text-xs text-text-muted">
                        amortering <MoneyValue value={p.principal} /> · ränta{" "}
                        <MoneyValue value={p.interest} />
                      </span>
                    </span>
                    <MoneyValue value={p.total} className="text-right" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function PayoffSection({
  householdId,
  onDebtChanged,
}: {
  householdId: string;
  onDebtChanged: () => void;
}) {
  const [method, setMethod] = useState<DebtPayoffMethod>("avalanche");
  const [extraInput, setExtraInput] = useState("");
  const [appliedExtraMinor, setAppliedExtraMinor] = useState<string | undefined>(
    undefined,
  );
  const [plan, setPlan] = useState<DebtPayoffResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rateDraft, setRateDraft] = useState("");
  const [savingRate, setSavingRate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getDebtPayoff(householdId, {
        method,
        extraMonthlyMinor: appliedExtraMinor,
      });
      setPlan(result);
    } catch (err) {
      setError(describeError(err, "Kunde inte räkna ut betalningsordning"));
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [householdId, method, appliedExtraMinor]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyExtra = () => {
    const trimmed = extraInput.trim();
    if (!trimmed) {
      setAppliedExtraMinor(undefined);
      return;
    }
    const minor = kronorToMinorString(trimmed);
    if (minor == null || BigInt(minor) < 0n) {
      setError("Ange ett giltigt belopp i kronor.");
      return;
    }
    setAppliedExtraMinor(minor);
  };

  const saveRate = async (accountId: string) => {
    const trimmed = rateDraft.replace(",", ".").trim();
    const pct = Number(trimmed);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setError("Räntan måste vara mellan 0 och 100 %.");
      return;
    }
    setSavingRate(true);
    setError(null);
    try {
      await api.updateAccount(accountId, {
        householdId,
        interestRateBps: Math.round(pct * 100),
      });
      setEditingId(null);
      setRateDraft("");
      await load();
      onDebtChanged();
    } catch (err) {
      setError(describeError(err, "Kunde inte spara räntan"));
    } finally {
      setSavingRate(false);
    }
  };

  return (
    <section
      className="space-y-4 rounded-[16px] bg-surface-elevated p-5"
      data-testid="debt-payoff"
      aria-labelledby="debt-payoff-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="debt-payoff-heading"
            className="font-[family-name:var(--ffos-font-display)] text-xl tracking-tight"
          >
            Betalningsordning
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Vilken skuld du tjänar mest på att betala av först.
          </p>
        </div>
        <div
          role="group"
          aria-label="Metod"
          className="flex rounded-[10px] bg-surface p-0.5"
        >
          <button
            type="button"
            onClick={() => setMethod("avalanche")}
            aria-pressed={method === "avalanche"}
            className={`min-h-9 rounded-[8px] px-3 text-sm ${
              method === "avalanche"
                ? "bg-surface-elevated font-medium text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            Ränta först
          </button>
          <button
            type="button"
            onClick={() => setMethod("snowball")}
            aria-pressed={method === "snowball"}
            className={`min-h-9 rounded-[8px] px-3 text-sm ${
              method === "snowball"
                ? "bg-surface-elevated font-medium text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            Minst först
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      ) : null}

      {loading && !plan ? (
        <LoadingState label="Räknar…" />
      ) : plan ? (
        <>
          {plan.focus ? (
            <div
              className="rounded-[12px] border border-accent/40 bg-accent/5 p-4"
              data-testid="debt-payoff-focus"
            >
              <p className="text-xs uppercase tracking-wide text-accent">
                Börja med
              </p>
              <p className="mt-1 font-medium text-text-primary">
                {plan.focus.name}
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                {plan.focus.reason}
              </p>
            </div>
          ) : null}

          <ol className="divide-y divide-border rounded-[12px] border border-border">
            {plan.items.map((item) => (
              <li key={item.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-medium tabular-nums">
                      {item.priority}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-text-primary">
                        {item.name}
                      </p>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {item.interestRatePercent.toFixed(2)} % ränta
                        {item.assumedRate ? " (antagen)" : ""} · ca{" "}
                        <MoneyValue value={item.monthlyInterest} />/mån i ränta
                      </p>
                      <p className="mt-1 text-xs text-text-secondary">
                        {item.reason}
                      </p>
                      {editingId === item.id ? (
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            inputMode="decimal"
                            value={rateDraft}
                            onChange={(e) => setRateDraft(e.target.value)}
                            placeholder="t.ex. 8,5"
                            aria-label={`Ränta för ${item.name} i procent`}
                            className="w-24 rounded-[8px] border border-border bg-surface px-2 py-1 text-sm tabular-nums"
                          />
                          <span className="text-xs text-text-muted">%</span>
                          <button
                            type="button"
                            onClick={() => void saveRate(item.id)}
                            disabled={savingRate}
                            className="min-h-8 rounded-[8px] bg-accent px-3 text-xs font-medium text-on-accent disabled:opacity-60"
                          >
                            {savingRate ? "Sparar…" : "Spara"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setRateDraft("");
                            }}
                            className="min-h-8 rounded-[8px] px-2 text-xs text-text-muted"
                          >
                            Avbryt
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(item.id);
                            setRateDraft(
                              item.assumedRate
                                ? ""
                                : item.interestRatePercent
                                    .toFixed(2)
                                    .replace(".", ","),
                            );
                          }}
                          className="mt-1 text-xs font-medium text-accent"
                        >
                          {item.assumedRate ? "Ange verklig ränta" : "Ändra ränta"}
                        </button>
                      )}
                    </div>
                  </div>
                  <MoneyValue
                    value={item.outstanding}
                    className="shrink-0 text-text-primary"
                  />
                </div>
              </li>
            ))}
          </ol>

          <div className="rounded-[12px] border border-border p-4">
            <label className="block text-sm">
              <span className="text-text-muted">
                Extra amortering per månad (kr)
              </span>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  inputMode="decimal"
                  value={extraInput}
                  onChange={(e) => setExtraInput(e.target.value)}
                  placeholder="t.ex. 5000"
                  className="w-40 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm tabular-nums"
                />
                <button
                  type="button"
                  onClick={applyExtra}
                  className="min-h-10 rounded-[10px] bg-accent px-4 text-sm font-medium text-on-accent"
                >
                  Räkna
                </button>
              </div>
            </label>
            {plan.projection ? (
              <div
                className="mt-3 text-sm text-text-secondary"
                data-testid="debt-payoff-projection"
              >
                {plan.projection.focusMonthsToClear != null ? (
                  <p>
                    Med{" "}
                    <MoneyValue value={plan.projection.extraMonthly} />/mån extra på{" "}
                    <span className="font-medium text-text-primary">
                      {plan.focus?.name}
                    </span>{" "}
                    är den slutbetald om{" "}
                    <span className="font-medium tabular-nums text-text-primary">
                      {plan.projection.focusMonthsToClear} mån
                    </span>{" "}
                    (ca {Math.floor(plan.projection.focusMonthsToClear / 12)} år{" "}
                    {plan.projection.focusMonthsToClear % 12} mån). Sparad ränta:{" "}
                    <MoneyValue value={plan.projection.focusInterestSaved} />.
                  </p>
                ) : (
                  <p>
                    Det extra beloppet räcker inte för att beta av räntan — höj det
                    så syns en slutbetalning här.
                  </p>
                )}
              </div>
            ) : null}
          </div>

          <ul className="space-y-1 text-xs text-text-muted">
            {plan.method_notes.map((note) => (
              <li key={note}>· {note}</li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <section className="rounded-[16px] bg-surface-elevated p-5">
      <p className="text-sm text-text-secondary">{label}</p>
      <div className="mt-2 text-lg font-medium">{value}</div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-[12px] bg-surface-elevated px-4 py-3">
      <p className="text-xs text-text-muted">{label}</p>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}
