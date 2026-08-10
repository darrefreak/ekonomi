"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { DebtDetailResponse, DebtResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
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
          Bolån, lån och kredit · principal vs ränta · as of {data.asOf}
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
