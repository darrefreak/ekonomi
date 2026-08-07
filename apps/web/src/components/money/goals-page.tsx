"use client";

import { useEffect, useState } from "react";
import type { GoalsResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

export function GoalsPage() {
  const [data, setData] = useState<GoalsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ensureHouseholdSession()
      .then((id) => api.getGoals(id))
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label="Hämtar mål…" />;
  if (error || !data) {
    return (
      <ErrorState title="Kunde inte hämta mål" description={error ?? "Ingen data"} />
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

      <section className="space-y-3">
        <h2 className="text-sm text-text-secondary">Aktiva mål</h2>
        {data.goals.map((goal) => (
          <article key={goal.id} className="rounded-[16px] bg-surface-elevated p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{goal.name}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {goal.goalType.replaceAll("_", " ").toLowerCase()}
                  {goal.targetDate ? ` · till ${goal.targetDate}` : ""}
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
            <dl className="mt-4 grid gap-2 text-sm md:grid-cols-3">
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
                <dt className="text-text-secondary">Krävs / mån</dt>
                <dd>
                  <MoneyValue value={goal.requiredMonthly} />
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm text-text-secondary">Sinking funds</h2>
        {data.sinkingFunds.map((fund) => (
          <article key={fund.id} className="rounded-[16px] bg-surface-elevated p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{fund.name}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {fund.monthlyContribution ? (
                    <>
                      <MoneyValue value={fund.monthlyContribution} /> / mån
                    </>
                  ) : null}
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
          </article>
        ))}
      </section>
    </div>
  );
}
