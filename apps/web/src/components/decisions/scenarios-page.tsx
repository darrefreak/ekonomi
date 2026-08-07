"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import type {
  ScenarioSimulationResponse,
  ScenariosResponse,
} from "@ffos/schemas";
import { api } from "@/lib/api";
import { kronorToMinorString } from "@/lib/money-input";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function ScenariosPage() {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [data, setData] = useState<ScenariosResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [simulation, setSimulation] =
    useState<ScenarioSimulationResponse | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [incomeDelta, setIncomeDelta] = useState("-10000");
  const [expenseDelta, setExpenseDelta] = useState("0");
  const [oneTime, setOneTime] = useState("0");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const id = await ensureHouseholdSession();
      setHouseholdId(id);
      setData(await api.getScenarios(id));
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

  async function createScenario(e: FormEvent) {
    e.preventDefault();
    if (!householdId || !name.trim()) {
      setActionError("Ange ett namn.");
      return;
    }
    const monthlyIncomeDeltaMinor = kronorToMinorString(incomeDelta) ?? "0";
    const monthlyExpenseDeltaMinor = kronorToMinorString(expenseDelta) ?? "0";
    const oneTimeCashDeltaMinor = kronorToMinorString(oneTime) ?? "0";
    setBusyKey("create");
    setActionError(null);
    try {
      const next = await api.createScenario({
        householdId,
        name: name.trim(),
        description: description.trim(),
        assumptions: {
          monthlyIncomeDeltaMinor,
          monthlyExpenseDeltaMinor,
          oneTimeCashDeltaMinor,
        },
      });
      setData(next);
      setName("");
      setDescription("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Kunde inte skapa");
    } finally {
      setBusyKey(null);
    }
  }

  async function runSimulate(scenarioId: string) {
    if (!householdId) return;
    setBusyKey(`sim-${scenarioId}`);
    setActionError(null);
    try {
      const result = await api.simulateScenario(scenarioId, { householdId });
      setSimulation(result);
      setData(await api.getScenarios(householdId));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Simulering misslyckades");
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) return <LoadingState label="Hämtar scenarios…" />;
  if (error) {
    return (
      <ErrorState
        title="Kunde inte hämta scenarios"
        description={error}
        onRetry={() => void load()}
      />
    );
  }
  if (!data) {
    return (
      <EmptyState
        title="Inga scenarios"
        description="Skapa ett what-if-scenario utan att ändra ledger."
        actionLabel="Försök igen"
        onAction={() => void load()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Scenarios
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Icke-destruktiv simulering · ledger muteras aldrig · as of {data.asOf}
        </p>
      </div>

      {actionError ? (
        <p className="text-sm text-negative" role="alert">
          {actionError}
        </p>
      ) : null}

      <form
        onSubmit={(e) => void createScenario(e)}
        className="space-y-3 rounded-[16px] bg-surface-elevated p-5"
      >
        <h2 className="text-sm font-medium text-text-secondary">Nytt scenario</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Namn (t.ex. Inkomstbortfall)"
          className="min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Beskrivning"
          className="min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm"
        />
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block text-sm">
            <span className="text-xs text-text-secondary">Δ inkomst / mån (kr)</span>
            <input
              inputMode="decimal"
              value={incomeDelta}
              onChange={(e) => setIncomeDelta(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 tabular-nums"
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-text-secondary">Δ utgift / mån (kr)</span>
            <input
              inputMode="decimal"
              value={expenseDelta}
              onChange={(e) => setExpenseDelta(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 tabular-nums"
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-text-secondary">Engångs kassa (kr)</span>
            <input
              inputMode="decimal"
              value={oneTime}
              onChange={(e) => setOneTime(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 tabular-nums"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={busyKey === "create"}
          className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-white disabled:opacity-60"
        >
          {busyKey === "create" ? "Skapar…" : "Skapa scenario"}
        </button>
      </form>

      {data.items.length === 0 ? (
        <EmptyState
          title="Inga sparade scenarios"
          description="Skapa ett scenario ovan och kör simulering."
        />
      ) : (
        <ul className="space-y-3">
          {data.items.map((s) => (
            <li key={s.id} className="rounded-[16px] bg-surface-elevated p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="mt-2 text-sm text-text-secondary">{s.description}</p>
                  <p className="mt-2 text-xs text-text-muted">
                    {s.status} · ledger orörd
                  </p>
                </div>
                <div className="text-right text-sm">
                  <MoneyValue value={s.projectedMonthlyDelta} signed />
                  <p className="text-xs text-text-secondary">/ mån</p>
                </div>
              </div>
              <button
                type="button"
                disabled={busyKey === `sim-${s.id}`}
                onClick={() => void runSimulate(s.id)}
                className="mt-4 min-h-11 rounded-[12px] border border-border-strong px-4 text-sm disabled:opacity-60"
              >
                {busyKey === `sim-${s.id}` ? "Simulerar…" : "Simulera"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {simulation ? (
        <section className="rounded-[16px] bg-surface-elevated p-5">
          <h2 className="text-sm font-medium text-text-secondary">
            Senaste simulering: {simulation.name}
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            ledgerMutated={String(simulation.ledgerMutated)} · as of{" "}
            {simulation.asOf}
          </p>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-3">
            <div>
              <dt className="text-text-secondary">Baseline / mån</dt>
              <dd>
                <MoneyValue value={simulation.baselineMonthlySavings} signed />
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">Justerad / mån</dt>
              <dd>
                <MoneyValue value={simulation.adjustedMonthlySavings} signed />
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">Δ / mån</dt>
              <dd>
                <MoneyValue value={simulation.projectedMonthlyDelta} signed />
              </dd>
            </div>
          </dl>
          <ul className="mt-4 divide-y divide-border rounded-[12px] border border-border">
            {simulation.points.map((p) => (
              <li
                key={p.label}
                className="flex justify-between gap-3 px-4 py-3 text-sm"
              >
                <span>
                  {p.label} · {p.onDate}
                </span>
                <MoneyValue value={p.projectedCash} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
