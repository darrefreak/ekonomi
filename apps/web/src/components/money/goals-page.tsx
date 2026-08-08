"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GoalItem } from "@ffos/schemas";
import { api } from "@/lib/api";
import { kronorToMinorString, minorToKronorInput } from "@/lib/money-input";
import { ensureHouseholdSession } from "@/lib/session";
import { useHouseholdId } from "@/lib/use-household-id";
import { queryKeys } from "@/lib/query-keys";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

const GOAL_TYPES = [
  "EMERGENCY_FUND",
  "INVESTMENT_TARGET",
  "DEBT_FREE",
  "HOME_PURCHASE",
  "CAR",
  "TRAVEL",
  "EDUCATION",
  "CUSTOM",
] as const;

const GOAL_TYPE_LABELS: Record<(typeof GOAL_TYPES)[number], string> = {
  EMERGENCY_FUND: "Buffert",
  INVESTMENT_TARGET: "Investeringsmål",
  DEBT_FREE: "Skuldfri",
  HOME_PURCHASE: "Bostadsköp",
  CAR: "Bil",
  TRAVEL: "Resa",
  EDUCATION: "Utbildning",
  CUSTOM: "Eget mål",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Aktivt",
  PAUSED: "Pausat",
  COMPLETED: "Klart",
  CANCELLED: "Avbrutet",
};

export function GoalsPage() {
  const householdId = useHouseholdId();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [goalAmounts, setGoalAmounts] = useState<Record<string, string>>({});
  const [fundAmounts, setFundAmounts] = useState<Record<string, string>>({});
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);

  const [newGoalName, setNewGoalName] = useState("");
  const [newGoalType, setNewGoalType] = useState<(typeof GOAL_TYPES)[number]>("CUSTOM");
  const [newGoalTarget, setNewGoalTarget] = useState("10000");
  const [newGoalMonthly, setNewGoalMonthly] = useState("0");
  const [newGoalTargetDate, setNewGoalTargetDate] = useState("");
  const [newFundName, setNewFundName] = useState("");
  const [newFundTarget, setNewFundTarget] = useState("5000");
  const [newFundMonthly, setNewFundMonthly] = useState("500");

  const goalsQuery = useQuery({
    queryKey: householdId ? queryKeys.goals.all(householdId) : ["goals", "pending"],
    queryFn: () => api.getGoals(householdId!),
    enabled: Boolean(householdId),
  });

  const invalidate = async () => {
    if (!householdId) return;
    await queryClient.invalidateQueries({ queryKey: queryKeys.goals.all(householdId) });
  };

  const contributeGoalMutation = useMutation({
    mutationFn: async (goalId: string) => {
      const id = await ensureHouseholdSession();
      const minor = kronorToMinorString(goalAmounts[goalId] ?? "");
      if (minor == null || BigInt(minor) <= 0n) {
        throw new Error("Ange ett positivt belopp i kronor.");
      }
      return api.contributeGoal(goalId, { householdId: id, amountMinor: minor });
    },
    onSuccess: async (_data, goalId) => {
      setActionError(null);
      setGoalAmounts((prev) => ({ ...prev, [goalId]: "" }));
      await invalidate();
    },
    onError: (err: unknown) => {
      setActionError(err instanceof Error ? err.message : "Kunde inte bidra");
    },
  });

  const contributeFundMutation = useMutation({
    mutationFn: async (fundId: string) => {
      const id = await ensureHouseholdSession();
      const minor = kronorToMinorString(fundAmounts[fundId] ?? "");
      if (minor == null || BigInt(minor) <= 0n) {
        throw new Error("Ange ett positivt belopp i kronor.");
      }
      return api.contributeSinkingFund(fundId, { householdId: id, amountMinor: minor });
    },
    onSuccess: async (_data, fundId) => {
      setActionError(null);
      setFundAmounts((prev) => ({ ...prev, [fundId]: "" }));
      await invalidate();
    },
    onError: (err: unknown) => {
      setActionError(err instanceof Error ? err.message : "Kunde inte bidra");
    },
  });

  const createGoalMutation = useMutation({
    mutationFn: async () => {
      const id = await ensureHouseholdSession();
      const targetMinor = kronorToMinorString(newGoalTarget);
      const monthlyContributionMinor = kronorToMinorString(newGoalMonthly || "0");
      if (!newGoalName.trim() || targetMinor == null || BigInt(targetMinor) <= 0n) {
        throw new Error("Ange namn och ett positivt målbelopp.");
      }
      if (monthlyContributionMinor == null) {
        throw new Error("Ange ett giltigt månadsbelopp.");
      }
      return api.createGoal({
        householdId: id,
        name: newGoalName.trim(),
        goalType: newGoalType,
        targetMinor,
        monthlyContributionMinor,
        targetDate: newGoalTargetDate || null,
      });
    },
    onSuccess: async () => {
      setActionError(null);
      setNewGoalName("");
      setNewGoalTarget("10000");
      setNewGoalMonthly("0");
      setNewGoalTargetDate("");
      await invalidate();
    },
    onError: (err: unknown) => {
      setActionError(err instanceof Error ? err.message : "Kunde inte skapa mål");
    },
  });

  const createFundMutation = useMutation({
    mutationFn: async () => {
      const id = await ensureHouseholdSession();
      const targetMinor = kronorToMinorString(newFundTarget);
      const monthlyContributionMinor = kronorToMinorString(newFundMonthly) ?? "0";
      if (!newFundName.trim() || targetMinor == null) {
        throw new Error("Ange namn och målbelopp för fonden.");
      }
      return api.createSinkingFund({
        householdId: id,
        name: newFundName.trim(),
        targetMinor,
        monthlyContributionMinor,
      });
    },
    onSuccess: async () => {
      setActionError(null);
      setNewFundName("");
      setNewFundTarget("5000");
      setNewFundMonthly("500");
      await invalidate();
    },
    onError: (err: unknown) => {
      setActionError(err instanceof Error ? err.message : "Kunde inte skapa fond");
    },
  });

  const data = goalsQuery.data;

  if (!householdId || goalsQuery.isLoading) return <LoadingState label="Hämtar mål…" />;
  if (goalsQuery.isError) {
    return (
      <ErrorState
        title="Kunde inte hämta mål"
        description={
          goalsQuery.error instanceof Error ? goalsQuery.error.message : "Något gick fel"
        }
        onRetry={() => void goalsQuery.refetch()}
      />
    );
  }
  if (!data) return null;

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
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void createGoalMutation.mutate();
        }}
        className="space-y-3 rounded-[16px] bg-surface-elevated p-5"
      >
        <h2 className="text-sm font-medium text-text-secondary">Nytt mål</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={newGoalName}
            onChange={(e) => setNewGoalName(e.target.value)}
            placeholder="Namn"
            className="min-h-11 rounded-[12px] border border-border bg-surface px-3 text-sm"
          />
          <select
            value={newGoalType}
            onChange={(e) => setNewGoalType(e.target.value as (typeof GOAL_TYPES)[number])}
            className="min-h-11 rounded-[12px] border border-border bg-surface px-3 text-sm"
          >
            {GOAL_TYPES.map((t) => (
              <option key={t} value={t}>
                {GOAL_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <label className="block text-sm">
            <span className="text-xs text-text-muted">Målbelopp (kr)</span>
            <input
              inputMode="decimal"
              value={newGoalTarget}
              onChange={(e) => setNewGoalTarget(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm tabular-nums"
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-text-muted">Plan / mån (kr)</span>
            <input
              inputMode="decimal"
              value={newGoalMonthly}
              onChange={(e) => setNewGoalMonthly(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm tabular-nums"
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-text-muted">Måldatum (valfritt)</span>
            <input
              type="date"
              value={newGoalTargetDate}
              onChange={(e) => setNewGoalTargetDate(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={createGoalMutation.isPending}
          className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-white disabled:opacity-60"
        >
          {createGoalMutation.isPending ? "Skapar…" : "Skapa mål"}
        </button>
      </form>

      <section className="space-y-3">
        <h2 className="text-sm text-text-secondary">Aktiva mål</h2>
        {data.goals.length === 0 ? (
          <EmptyState
            title="Inga mål"
            description="Skapa ett mål ovan för att börja spara mot något konkret."
          />
        ) : (
          data.goals.map((goal) =>
            editingGoalId === goal.id ? (
              <GoalEditForm
                key={goal.id}
                goal={goal}
                householdId={householdId}
                onClose={() => setEditingGoalId(null)}
                onError={setActionError}
              />
            ) : (
              <article key={goal.id} className="rounded-[16px] bg-surface-elevated p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{goal.name}</p>
                    <p className="mt-1 text-xs text-text-muted">
                      {GOAL_TYPE_LABELS[goal.goalType as (typeof GOAL_TYPES)[number]] ??
                        goal.goalType}
                      {" · "}
                      {STATUS_LABELS[goal.status] ?? goal.status}
                      {goal.targetDate ? ` · till ${goal.targetDate}` : ""}
                      {goal.sinkingFundId ? " · länkad sinking fund" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="tabular-nums text-sm text-text-secondary">
                      {goal.percentComplete.toFixed(0)} %
                    </p>
                    <button
                      type="button"
                      onClick={() => setEditingGoalId(goal.id)}
                      className="min-h-11 rounded-[12px] border border-border-strong px-3 text-sm"
                    >
                      Redigera
                    </button>
                  </div>
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
                {goal.status === "ACTIVE" ? (
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
                      disabled={contributeGoalMutation.isPending}
                      onClick={() => void contributeGoalMutation.mutate(goal.id)}
                      className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-white disabled:opacity-60"
                    >
                      Bidra
                    </button>
                  </div>
                ) : null}
              </article>
            ),
          )
        )}
      </section>

      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void createFundMutation.mutate();
        }}
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
            disabled={createFundMutation.isPending}
            className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            {createFundMutation.isPending ? "Skapar…" : "Skapa"}
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
                  disabled={contributeFundMutation.isPending}
                  onClick={() => void contributeFundMutation.mutate(fund.id)}
                  className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-white disabled:opacity-60"
                >
                  Bidra
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function GoalEditForm({
  goal,
  householdId,
  onClose,
  onError,
}: {
  goal: GoalItem;
  householdId: string;
  onClose: () => void;
  onError: (msg: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(goal.name);
  const [targetKr, setTargetKr] = useState(minorToKronorInput(goal.target.amountMinor));
  const [monthlyKr, setMonthlyKr] = useState(
    minorToKronorInput(goal.monthlyContribution.amountMinor),
  );
  const [targetDate, setTargetDate] = useState(goal.targetDate ?? "");
  const [priority, setPriority] = useState(goal.priority);
  const [status, setStatus] = useState(goal.status);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const id = await ensureHouseholdSession();
      const targetMinor = kronorToMinorString(targetKr);
      const monthlyContributionMinor = kronorToMinorString(monthlyKr);
      if (!name.trim() || targetMinor == null || BigInt(targetMinor) <= 0n) {
        throw new Error("Ange namn och ett positivt målbelopp.");
      }
      if (monthlyContributionMinor == null) {
        throw new Error("Ange ett giltigt månadsbelopp.");
      }
      return api.updateGoal(goal.id, {
        householdId: id,
        name: name.trim(),
        targetMinor,
        monthlyContributionMinor,
        targetDate: targetDate || null,
        priority,
        status: status as "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED",
      });
    },
    onSuccess: async () => {
      onError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.goals.all(householdId) });
      onClose();
    },
    onError: (err: unknown) => {
      onError(err instanceof Error ? err.message : "Kunde inte spara målet");
    },
  });

  return (
    <article className="space-y-3 rounded-[16px] border border-accent/40 bg-surface-elevated p-5">
      <h3 className="text-sm font-medium text-text-secondary">Redigera mål</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm">
          <span className="text-xs text-text-muted">Namn</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs text-text-muted">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm"
          >
            <option value="ACTIVE">Aktivt</option>
            <option value="PAUSED">Pausat</option>
            <option value="COMPLETED">Klart</option>
            <option value="CANCELLED">Avbrutet</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-xs text-text-muted">Målbelopp (kr)</span>
          <input
            inputMode="decimal"
            value={targetKr}
            onChange={(e) => setTargetKr(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm tabular-nums"
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs text-text-muted">Plan / mån (kr)</span>
          <input
            inputMode="decimal"
            value={monthlyKr}
            onChange={(e) => setMonthlyKr(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm tabular-nums"
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs text-text-muted">Måldatum</span>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs text-text-muted">Prioritet (1–5)</span>
          <input
            type="number"
            min={1}
            max={5}
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm tabular-nums"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={saveMutation.isPending}
          onClick={() => void saveMutation.mutate()}
          className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-white disabled:opacity-60"
        >
          {saveMutation.isPending ? "Sparar…" : "Spara"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-[12px] border border-border-strong px-4 text-sm"
        >
          Avbryt
        </button>
      </div>
    </article>
  );
}
