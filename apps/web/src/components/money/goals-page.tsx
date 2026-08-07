"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import type { GoalsResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { kronorToMinorString } from "@/lib/money-input";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function GoalsPage() {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [data, setData] = useState<GoalsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [goalAmounts, setGoalAmounts] = useState<Record<string, string>>({});
  const [fundAmounts, setFundAmounts] = useState<Record<string, string>>({});
  const [newGoalName, setNewGoalName] = useState("");
  const [newGoalTarget, setNewGoalTarget] = useState("10000");
  const [newFundName, setNewFundName] = useState("");
  const [newFundTarget, setNewFundTarget] = useState("5000");
  const [newFundMonthly, setNewFundMonthly] = useState("500");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const id = await ensureHouseholdSession();
      setHouseholdId(id);
      setData(await api.getGoals(id));
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

  async function contributeGoal(goalId: string) {
    if (!householdId) return;
    const minor = kronorToMinorString(goalAmounts[goalId] ?? "");
    if (minor == null || BigInt(minor) <= 0n) {
      setActionError("Ange ett positivt belopp i kronor.");
      return;
    }
    setBusyKey(`goal-${goalId}`);
    setActionError(null);
    try {
      const next = await api.contributeGoal(goalId, {
        householdId,
        amountMinor: minor,
      });
      setData(next);
      setGoalAmounts((prev) => ({ ...prev, [goalId]: "" }));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Kunde inte bidra");
    } finally {
      setBusyKey(null);
    }
  }

  async function contributeFund(fundId: string) {
    if (!householdId) return;
    const minor = kronorToMinorString(fundAmounts[fundId] ?? "");
    if (minor == null || BigInt(minor) <= 0n) {
      setActionError("Ange ett positivt belopp i kronor.");
      return;
    }
    setBusyKey(`fund-${fundId}`);
    setActionError(null);
    try {
      const next = await api.contributeSinkingFund(fundId, {
        householdId,
        amountMinor: minor,
      });
      setData(next);
      setFundAmounts((prev) => ({ ...prev, [fundId]: "" }));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Kunde inte bidra");
    } finally {
      setBusyKey(null);
    }
  }

  async function createGoal(e: FormEvent) {
    e.preventDefault();
    if (!householdId) return;
    const targetMinor = kronorToMinorString(newGoalTarget);
    if (!newGoalName.trim() || targetMinor == null) {
      setActionError("Ange namn och målbelopp.");
      return;
    }
    setBusyKey("create-goal");
    setActionError(null);
    try {
      const next = await api.createGoal({
        householdId,
        name: newGoalName.trim(),
        targetMinor,
        goalType: "CUSTOM",
      });
      setData(next);
      setNewGoalName("");
      setNewGoalTarget("10000");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Kunde inte skapa mål");
    } finally {
      setBusyKey(null);
    }
  }

  async function createFund(e: FormEvent) {
    e.preventDefault();
    if (!householdId) return;
    const targetMinor = kronorToMinorString(newFundTarget);
    const monthlyContributionMinor = kronorToMinorString(newFundMonthly) ?? "0";
    if (!newFundName.trim() || targetMinor == null) {
      setActionError("Ange namn och målbelopp för fonden.");
      return;
    }
    setBusyKey("create-fund");
    setActionError(null);
    try {
      const next = await api.createSinkingFund({
        householdId,
        name: newFundName.trim(),
        targetMinor,
        monthlyContributionMinor,
      });
      setData(next);
      setNewFundName("");
      setNewFundTarget("5000");
      setNewFundMonthly("500");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Kunde inte skapa fond");
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) return <LoadingState label="Hämtar mål…" />;
  if (error) {
    return (
      <ErrorState
        title="Kunde inte hämta mål"
        description={error}
        onRetry={() => void load()}
      />
    );
  }
  if (!data) {
    return (
      <EmptyState
        title="Inga mål ännu"
        description="Skapa ett sparmål eller en sinking fund för att börja planera."
        actionLabel="Försök igen"
        onAction={() => void load()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Mål
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Sparmål och öronmärkta fonder · as of {data.asOf}
        </p>
      </div>

      {actionError ? (
        <p className="text-sm text-negative" role="alert">
          {actionError}
        </p>
      ) : null}

      <form
        onSubmit={(e) => void createGoal(e)}
        className="space-y-3 rounded-[16px] bg-surface-elevated p-5"
      >
        <h2 className="text-sm font-medium text-text-secondary">Nytt mål</h2>
        <div className="grid gap-3 md:grid-cols-[1fr_8rem_auto]">
          <input
            value={newGoalName}
            onChange={(e) => setNewGoalName(e.target.value)}
            placeholder="Namn"
            className="min-h-11 rounded-[12px] border border-border bg-surface px-3 text-sm"
          />
          <input
            inputMode="decimal"
            value={newGoalTarget}
            onChange={(e) => setNewGoalTarget(e.target.value)}
            placeholder="Mål (kr)"
            className="min-h-11 rounded-[12px] border border-border bg-surface px-3 text-sm tabular-nums"
          />
          <button
            type="submit"
            disabled={busyKey === "create-goal"}
            className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            {busyKey === "create-goal" ? "Skapar…" : "Skapa"}
          </button>
        </div>
      </form>

      <section className="space-y-3">
        <h2 className="text-sm text-text-secondary">Aktiva mål</h2>
        {data.goals.length === 0 ? (
          <EmptyState
            title="Inga mål"
            description="Skapa ett mål ovan för att börja spara mot något konkret."
          />
        ) : (
          data.goals.map((goal) => (
            <article key={goal.id} className="rounded-[16px] bg-surface-elevated p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{goal.name}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {goal.goalType.replaceAll("_", " ").toLowerCase()}
                    {goal.targetDate ? ` · till ${goal.targetDate}` : ""}
                    {goal.sinkingFundId ? " · länkad sinking fund" : ""}
                  </p>
                </div>
                <p className="tabular-nums text-sm text-text-secondary">
                  {goal.percentComplete.toFixed(0)} %
                </p>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full bg-accent"
                  style={{ width: `${Math.min(100, goal.percentComplete)}%` }}
                />
              </div>
              <dl className="mt-4 grid gap-2 text-sm md:grid-cols-4">
                <div>
                  <dt className="text-text-secondary">Nu</dt>
                  <dd>
                    <MoneyValue value={goal.current} />
                  </dd>
                </div>
                <div>
                  <dt className="text-text-secondary">Mål</dt>
                  <dd>
                    <MoneyValue value={goal.target} />
                  </dd>
                </div>
                <div>
                  <dt className="text-text-secondary">Plan / mån</dt>
                  <dd>
                    <MoneyValue value={goal.monthlyContribution} />
                  </dd>
                </div>
                <div>
                  <dt className="text-text-secondary">Krävs / mån</dt>
                  <dd>
                    <MoneyValue value={goal.requiredMonthly} />
                  </dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap items-end gap-2">
                <label className="block text-sm">
                  <span className="text-xs text-text-secondary">Bidra (kr)</span>
                  <input
                    inputMode="decimal"
                    value={goalAmounts[goal.id] ?? ""}
                    onChange={(e) =>
                      setGoalAmounts((prev) => ({
                        ...prev,
                        [goal.id]: e.target.value,
                      }))
                    }
                    className="mt-1 min-h-11 w-36 rounded-[12px] border border-border bg-surface px-3 tabular-nums"
                  />
                </label>
                <button
                  type="button"
                  disabled={busyKey === `goal-${goal.id}`}
                  onClick={() => void contributeGoal(goal.id)}
                  className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-white disabled:opacity-60"
                >
                  {busyKey === `goal-${goal.id}` ? "Sparar…" : "Bidra"}
                </button>
              </div>
            </article>
          ))
        )}
      </section>

      <form
        onSubmit={(e) => void createFund(e)}
        className="space-y-3 rounded-[16px] bg-surface-elevated p-5"
      >
        <h2 className="text-sm font-medium text-text-secondary">Ny sinking fund</h2>
        <div className="grid gap-3 md:grid-cols-[1fr_7rem_7rem_auto]">
          <input
            value={newFundName}
            onChange={(e) => setNewFundName(e.target.value)}
            placeholder="Namn"
            className="min-h-11 rounded-[12px] border border-border bg-surface px-3 text-sm"
          />
          <input
            inputMode="decimal"
            value={newFundTarget}
            onChange={(e) => setNewFundTarget(e.target.value)}
            placeholder="Mål"
            className="min-h-11 rounded-[12px] border border-border bg-surface px-3 text-sm tabular-nums"
          />
          <input
            inputMode="decimal"
            value={newFundMonthly}
            onChange={(e) => setNewFundMonthly(e.target.value)}
            placeholder="/ mån"
            className="min-h-11 rounded-[12px] border border-border bg-surface px-3 text-sm tabular-nums"
          />
          <button
            type="submit"
            disabled={busyKey === "create-fund"}
            className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            {busyKey === "create-fund" ? "Skapar…" : "Skapa"}
          </button>
        </div>
      </form>

      <section className="space-y-3">
        <h2 className="text-sm text-text-secondary">Sinking funds</h2>
        {data.sinkingFunds.length === 0 ? (
          <EmptyState
            title="Inga sinking funds"
            description="Öronmärk pengar för bilunderhåll, semester eller andra framtida kostnader."
          />
        ) : (
          data.sinkingFunds.map((fund) => (
            <article key={fund.id} className="rounded-[16px] bg-surface-elevated p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{fund.name}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    <MoneyValue value={fund.monthlyContribution} /> / mån
                    {fund.targetDate ? ` · till ${fund.targetDate}` : ""}
                  </p>
                </div>
                <p className="tabular-nums text-sm text-text-secondary">
                  {fund.percentComplete.toFixed(0)} %
                </p>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full bg-accent"
                  style={{ width: `${Math.min(100, fund.percentComplete)}%` }}
                />
              </div>
              <p className="mt-3 text-sm text-text-secondary">
                <MoneyValue value={fund.currentReserved} /> av{" "}
                <MoneyValue value={fund.target} />
              </p>
              <div className="mt-4 flex flex-wrap items-end gap-2">
                <label className="block text-sm">
                  <span className="text-xs text-text-secondary">Bidra (kr)</span>
                  <input
                    inputMode="decimal"
                    value={fundAmounts[fund.id] ?? ""}
                    onChange={(e) =>
                      setFundAmounts((prev) => ({
                        ...prev,
                        [fund.id]: e.target.value,
                      }))
                    }
                    className="mt-1 min-h-11 w-36 rounded-[12px] border border-border bg-surface px-3 tabular-nums"
                  />
                </label>
                <button
                  type="button"
                  disabled={busyKey === `fund-${fund.id}`}
                  onClick={() => void contributeFund(fund.id)}
                  className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-white disabled:opacity-60"
                >
                  {busyKey === `fund-${fund.id}` ? "Sparar…" : "Bidra"}
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
