"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { BudgetResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { kronorToMinorString, minorToKronorInput } from "@/lib/money-input";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function BudgetPage() {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [data, setData] = useState<BudgetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const id = await ensureHouseholdSession();
      setHouseholdId(id);
      const budget = await api.getBudget(id);
      setData(budget);
      setDrafts(
        Object.fromEntries(
          budget.lines.map((line) => [
            line.id,
            minorToKronorInput(line.planned.amountMinor),
          ]),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Något gick fel");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveLine(lineId: string) {
    if (!householdId || !data) return;
    const minor = kronorToMinorString(drafts[lineId] ?? "");
    if (minor == null || BigInt(minor) < 0n) {
      setActionError("Ange ett giltigt belopp i kronor (t.ex. 8500).");
      return;
    }
    setSavingId(lineId);
    setActionError(null);
    try {
      const next = await api.updateBudgetLine(lineId, {
        householdId,
        plannedMinor: minor,
      });
      setData(next);
      setDrafts(
        Object.fromEntries(
          next.lines.map((line) => [
            line.id,
            minorToKronorInput(line.planned.amountMinor),
          ]),
        ),
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Kunde inte spara");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <LoadingState label="Hämtar budget…" />;
  if (error) {
    return (
      <ErrorState
        title="Kunde inte hämta budget"
        description={error}
        onRetry={() => void load()}
      />
    );
  }
  if (!data) {
    return (
      <EmptyState
        title="Ingen budgetperiod"
        description="Skapa eller seeda en budgetperiod för hushållet för att planera utgifter."
        actionLabel="Försök igen"
        onAction={() => void load()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Budget
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Planerat vs faktiskt (från financial events) · {data.period.label} · as
          of {data.asOf}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Planerat" value={<MoneyValue value={data.totals.planned} />} />
        <Stat label="Faktiskt" value={<MoneyValue value={data.totals.actual} />} />
        <Stat label="Kvar" value={<MoneyValue value={data.totals.remaining} signed />} />
        <Stat
          label="Utnyttjande"
          value={
            <span className="tabular-nums">
              {data.totals.utilizationPercent.toFixed(0)} %
            </span>
          }
        />
      </div>

      {actionError ? (
        <p className="text-sm text-negative" role="alert">
          {actionError}
        </p>
      ) : null}

      {data.lines.length === 0 ? (
        <EmptyState
          title="Inga budgetrader"
          description="Den här perioden saknar rader. Seed eller skapa rader via API."
        />
      ) : (
        <section className="overflow-hidden rounded-[16px] bg-surface-elevated">
          <ul className="divide-y divide-border">
            {data.lines.map((line) => (
              <li key={line.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-text-primary">{line.name}</p>
                    <p className="mt-1 text-xs text-text-muted">
                      Faktiskt <MoneyValue value={line.actual} /> ·{" "}
                      {line.utilizationPercent.toFixed(0)} % av budget
                    </p>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="block text-sm">
                      <span className="text-xs text-text-secondary">
                        Planerat (kr)
                      </span>
                      <input
                        inputMode="decimal"
                        value={drafts[line.id] ?? ""}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [line.id]: e.target.value,
                          }))
                        }
                        className="mt-1 min-h-11 w-32 rounded-[12px] border border-border bg-surface px-3 tabular-nums"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={savingId === line.id}
                      onClick={() => void saveLine(line.id)}
                      className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {savingId === line.id ? "Sparar…" : "Spara"}
                    </button>
                  </div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full bg-accent"
                    style={{
                      width: `${Math.min(100, Math.max(0, line.utilizationPercent))}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  Kvar: <MoneyValue value={line.remaining} signed />
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <section className="rounded-[16px] bg-surface-elevated p-5">
      <p className="text-sm text-text-secondary">{label}</p>
      <div className="mt-2 text-lg">{value}</div>
    </section>
  );
}
