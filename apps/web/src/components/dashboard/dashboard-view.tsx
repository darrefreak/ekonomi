"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { DashboardResponse } from "@ffos/schemas";
import { CoverageList } from "../financial/coverage-list";
import { MiniCashflowChart } from "../financial/mini-cashflow-chart";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";

export function DashboardView({ data }: { data: DashboardResponse }) {
  const opportunities = data.opportunities ?? [];
  const cashflowPoints = data.cashflowPoints ?? [];
  const hasAccounts = data.hasAccounts ?? cashflowPoints.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-text-muted">{data.greeting}</p>
        <h1 className="mt-1 font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight text-text-primary md:text-4xl">
          {data.householdName}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Finansiell position · {data.freshnessLabel} · as of {data.asOf}
        </p>
      </div>

      {!hasAccounts ? (
        <div className="space-y-3">
          <EmptyState
            title="Ingen finansiell data ännu"
            description="Lägg till konton under Konton eller ladda demodata för att fylla översikten."
          />
          <Link
            href="/accounts"
            className="inline-flex min-h-11 items-center text-sm font-medium text-accent"
          >
            Gå till konton →
          </Link>
        </div>
      ) : null}

      <section aria-labelledby="position-heading">
        <h2 id="position-heading" className="sr-only">
          Finansiell position
        </h2>
        <div className="rounded-[18px] bg-surface-elevated p-5 shadow-[var(--ffos-shadow-soft)] md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-text-secondary">Nettoförmögenhet</p>
              <p className="mt-1 text-3xl font-medium tracking-tight text-text-primary md:text-4xl">
                <MoneyValue value={data.position.netWorth} />
              </p>
              <p className="mt-2 text-sm text-positive">
                <MoneyValue value={data.position.netWorthChangeMonth} signed /> den här
                månaden
              </p>
            </div>
            <Link
              href="/net-worth"
              className="min-h-11 text-sm font-medium text-accent"
            >
              Nettoförmögenhet →
            </Link>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3">
            <Metric label="Likvida medel" value={<MoneyValue value={data.position.availableCash} />} />
            <Metric label="Investeringar" value={<MoneyValue value={data.position.investments} />} />
            <Metric
              label="Skuld"
              value={
                <Link href="/debt" className="hover:text-accent">
                  <MoneyValue value={data.position.debt} />
                </Link>
              }
            />
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-[18px] bg-surface-elevated p-5 shadow-[var(--ffos-shadow-soft)]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-text-secondary">Den här månaden</h2>
            <Link href="/budget" className="text-sm text-accent">
              Budget
            </Link>
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            <Row label="Inkomst" value={<MoneyValue value={data.thisMonth.income} />} />
            <Row label="Utgifter" value={<MoneyValue value={data.thisMonth.spending} />} />
            <Row label="Sparat" value={<MoneyValue value={data.thisMonth.savings} />} />
            <Row
              label="Sparandegrad"
              value={
                <span className="tabular-nums">
                  {data.thisMonth.savingsRatePercent.toFixed(1)} %
                </span>
              }
            />
            <Row
              label="Budget kvar"
              value={<MoneyValue value={data.thisMonth.budgetRemaining} signed />}
            />
          </dl>
          <p className="mt-4 text-sm text-text-muted">
            Cash runway:{" "}
            <span className="tabular-nums text-text-primary">
              {data.cashRunwayMonths.toFixed(1)} månader
            </span>
          </p>
          {data.reviewCount > 0 ? (
            <Link
              href="/review"
              className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-accent"
            >
              {data.reviewCount} poster behöver granskning →
            </Link>
          ) : null}
        </section>

        <section className="rounded-[18px] bg-surface-elevated p-5 shadow-[var(--ffos-shadow-soft)]">
          <h2 className="text-sm font-medium text-text-secondary">Finansiell brief</h2>
          <p className="mt-2 text-base text-text-primary">{data.brief.headline}</p>
          {data.brief.items.length === 0 ? (
            <p className="mt-4 text-sm text-text-muted">Inga briefpunkter just nu.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {data.brief.items.map((item, index) => (
                <li key={item.id} className="text-sm">
                  <p className="font-medium text-text-primary">
                    {index + 1}. {item.title}
                  </p>
                  <p className="mt-1 text-text-secondary">{item.detail}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="rounded-[18px] bg-surface-elevated p-5 shadow-[var(--ffos-shadow-soft)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-text-secondary">
            Prognos (kassaförändring)
          </h2>
          <Link href="/forecast" className="text-sm text-accent">
            Visa mer
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <ForecastCell label="30 dagar" value={data.forecast.days30} />
          <ForecastCell label="60 dagar" value={data.forecast.days60} />
          <ForecastCell label="90 dagar" value={data.forecast.days90} />
        </div>
        <p className="mt-3 text-xs text-text-muted">
          Linjär prognos från aktuell månads nettobesparing via financial-engine.
        </p>
      </section>

      <section className="rounded-[18px] bg-surface-elevated p-5 shadow-[var(--ffos-shadow-soft)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-text-secondary">Opportunities</h2>
          <Link href="/opportunities" className="text-sm text-accent">
            Alla
          </Link>
        </div>
        {opportunities.length === 0 ? (
          <p className="text-sm text-text-muted">
            Inga aktiva opportunities just nu. Detektorn fylls på när mer data finns.
          </p>
        ) : (
          <ul className="space-y-3">
            {opportunities.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
              >
                <div>
                  <p className="text-sm font-medium text-text-primary">{item.title}</p>
                  <p className="mt-1 text-xs text-text-secondary line-clamp-2">
                    {item.description}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    {item.effort} effort
                    {item.confidence != null
                      ? ` · ${(item.confidence * 100).toFixed(0)}% confidence`
                      : ""}
                  </p>
                </div>
                {item.estimatedAnnualSaving ? (
                  <div className="shrink-0 text-right text-sm">
                    <MoneyValue value={item.estimatedAnnualSaving} />
                    <p className="text-xs text-text-muted">/ år</p>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-[18px] bg-surface-elevated p-5 shadow-[var(--ffos-shadow-soft)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-text-secondary">Kassaflöde</h2>
            <Link href="/cashflow" className="text-sm text-accent">
              Visa mer
            </Link>
          </div>
          {cashflowPoints.length === 0 ? (
            <p className="text-sm text-text-muted">Ingen kassaflödeshistorik ännu.</p>
          ) : (
            <MiniCashflowChart points={cashflowPoints} />
          )}
        </section>

        <section className="rounded-[18px] bg-surface-elevated p-5 shadow-[var(--ffos-shadow-soft)]">
          <CoverageList
            percent={data.coveragePercent}
            areas={data.coverageAreas ?? []}
          />
        </section>
      </div>

      <section className="rounded-[18px] bg-surface-elevated p-5 shadow-[var(--ffos-shadow-soft)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-text-secondary">Kommande</h2>
          <Link href="/subscriptions" className="text-sm text-accent">
            Abonnemang
          </Link>
        </div>
        {data.upcoming.length === 0 ? (
          <p className="text-sm text-text-muted">
            Inga kommande betalningar eller estimerade inkomster inom 45 dagar.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.upcoming.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <div>
                  <p className="font-medium text-text-primary">{item.title}</p>
                  <p className="text-text-muted">{item.date}</p>
                </div>
                <MoneyValue
                  value={item.amount}
                  signed={item.kind === "income"}
                  className="text-text-primary"
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ForecastCell({
  label,
  value,
}: {
  label: string;
  value: DashboardResponse["forecast"]["days30"];
}) {
  return (
    <div className="rounded-[12px] bg-surface px-3 py-3">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-1 text-base font-medium tabular-nums text-text-primary">
        <MoneyValue value={value} signed />
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-1 text-lg font-medium text-text-primary">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="text-text-primary">{value}</dd>
    </div>
  );
}
