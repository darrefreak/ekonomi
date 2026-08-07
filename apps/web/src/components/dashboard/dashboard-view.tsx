"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { DashboardResponse } from "@ffos/schemas";
import { CoverageList } from "../financial/coverage-list";
import { MiniCashflowChart } from "../financial/mini-cashflow-chart";
import { MoneyValue } from "../financial/money-value";

export function DashboardView({ data }: { data: DashboardResponse }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-text-muted">{data.greeting}</p>
        <h1 className="mt-1 font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight text-text-primary md:text-4xl">
          {data.householdName}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Finansiell position · {data.freshnessLabel}
        </p>
      </div>

      <section aria-labelledby="position-heading">
        <h2 id="position-heading" className="sr-only">
          Finansiell position
        </h2>
        <div className="rounded-[18px] bg-surface-elevated p-5 shadow-[var(--ffos-shadow-soft)] md:p-6">
          <p className="text-sm text-text-secondary">Nettoförmögenhet</p>
          <p className="mt-1 text-3xl font-medium tracking-tight text-text-primary md:text-4xl">
            <MoneyValue value={data.position.netWorth} />
          </p>
          <p className="mt-2 text-sm text-positive">
            <MoneyValue value={data.position.netWorthChangeMonth} signed /> den här
            månaden
          </p>
          <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3">
            <Metric label="Likvida medel" value={<MoneyValue value={data.position.availableCash} />} />
            <Metric label="Investeringar" value={<MoneyValue value={data.position.investments} />} />
            <Metric label="Skuld" value={<MoneyValue value={data.position.debt} />} />
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-[18px] bg-surface-elevated p-5 shadow-[var(--ffos-shadow-soft)]">
          <h2 className="text-sm font-medium text-text-secondary">Den här månaden</h2>
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
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-[18px] bg-surface-elevated p-5 shadow-[var(--ffos-shadow-soft)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-text-secondary">Kassaflöde</h2>
            <Link href="/cashflow" className="text-sm text-accent">
              Visa mer
            </Link>
          </div>
          <MiniCashflowChart points={data.cashflowPoints ?? []} />
        </section>

        <section className="rounded-[18px] bg-surface-elevated p-5 shadow-[var(--ffos-shadow-soft)]">
          <CoverageList
            percent={data.coveragePercent}
            areas={data.coverageAreas ?? []}
          />
        </section>
      </div>

      <section className="rounded-[18px] bg-surface-elevated p-5 shadow-[var(--ffos-shadow-soft)]">
        <h2 className="text-sm font-medium text-text-secondary">Kommande</h2>
        <ul className="mt-4 space-y-3">
          {data.upcoming.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
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
      </section>
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
