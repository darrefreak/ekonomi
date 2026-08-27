"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { DashboardResponse } from "@ffos/schemas";
import { CoverageList } from "../financial/coverage-list";
import { FinancialBriefCard } from "./financial-brief-card";
import { MiniCashflowChart } from "../financial/mini-cashflow-chart";
import { MoneyValue } from "../financial/money-value";
import { SpendingVsNormalCard } from "./spending-vs-normal-card";
import { EmptyState } from "../feedback/empty-state";

const effortLabels: Record<string, string> = {
  low: "Liten insats",
  medium: "Måttlig insats",
  high: "Större insats",
};

export function DashboardView({ data }: { data: DashboardResponse }) {
  const opportunities = data.opportunities ?? [];
  const cashflowPoints = data.cashflowPoints ?? [];
  const hasAccounts = data.hasAccounts ?? cashflowPoints.length > 0;
  const excludedByCurrency = data.excludedByCurrency ?? [];
  const sourceNeedsAttention =
    /omautentisering|synkfel|frånkopplad|ingen data/i.test(data.freshnessLabel);
  const hasAttention = sourceNeedsAttention || data.reviewCount > 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-text-muted">{data.greeting}</p>
        <h1 className="mt-1 font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight text-text-primary md:text-4xl">
          {data.householdName}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Läge per {data.asOf} ·{" "}
          {sourceNeedsAttention ? "data behöver uppdateras" : data.freshnessLabel}
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

      {excludedByCurrency.length > 0 ? (
        <div
          role="status"
          data-testid="excluded-currency-warning"
          className="rounded-[18px] border border-warning/40 bg-warning/10 p-4 text-sm"
        >
          <p className="font-medium text-text-primary">
            Summorna nedan omfattar inte alla konton
          </p>
          <p className="mt-1 text-text-secondary">
            {excludedByCurrency.length === 1
              ? `Kontot ${excludedByCurrency[0]!.name} använder ${excludedByCurrency[0]!.currency}`
              : `${excludedByCurrency.length} konton använder en annan valuta`}
            , men hushållet räknar sina summor i {data.position.netWorth.currency}.
            Växelkursberäkning finns inte ännu, så de räknas inte med. Arkivera
            kontot eller lägg in det i {data.position.netWorth.currency} för att
            få en fullständig bild.
          </p>
          <Link
            href="/accounts"
            className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-accent"
          >
            Hantera konton →
          </Link>
        </div>
      ) : null}

      <section
        aria-labelledby="attention-heading"
        className={`rounded-[18px] border p-5 md:p-6 ${
          hasAttention
            ? "border-warning/40 bg-warning/10"
            : "border-positive/30 bg-positive/10"
        }`}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
          Just nu
        </p>
        <div className="mt-2 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <h2
              id="attention-heading"
              className="font-[family-name:var(--ffos-font-display)] text-2xl tracking-tight"
            >
              {sourceNeedsAttention
                ? "Uppdatera en datakälla för att lita på dagens siffror"
                : data.reviewCount > 0
                  ? `${data.reviewCount} poster behöver din hjälp`
                  : "Inget akut behöver hanteras"}
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              {sourceNeedsAttention
                ? "En koppling behöver förnyas. Befintlig historik finns kvar under tiden."
                : data.reviewCount > 0
                  ? "En snabb granskning förbättrar kategorier, budget och kommande insikter."
                  : "Fortsätt till kommande händelser eller fördjupa dig när det passar."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {sourceNeedsAttention ? (
              <Link
                href="/integrations"
                className="inline-flex min-h-11 items-center rounded-[12px] bg-accent px-4 text-sm font-medium text-on-accent"
              >
                Uppdatera koppling
              </Link>
            ) : null}
            {data.reviewCount > 0 ? (
              <Link
                href="/review"
                className={`inline-flex min-h-11 items-center rounded-[12px] px-4 text-sm font-medium ${
                  sourceNeedsAttention
                    ? "border border-border-strong text-text-primary"
                    : "bg-accent text-on-accent"
                }`}
              >
                Granska nu
              </Link>
            ) : null}
            {!hasAttention ? (
              <Link
                href="/calendar"
                className="inline-flex min-h-11 items-center rounded-[12px] bg-accent px-4 text-sm font-medium text-on-accent"
              >
                Se vad som kommer
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-[18px] bg-surface-elevated p-5 shadow-[var(--ffos-shadow-soft)]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-text-secondary">Den här månaden</h2>
            <Link
              href="/budget"
              className="inline-flex min-h-11 items-center text-sm text-accent"
            >
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
            Ekonomisk uthållighet:{" "}
            <span className="tabular-nums text-text-primary">
              {data.cashRunwayMonths.toFixed(1)} månader
            </span>
          </p>
        </section>

        <FinancialBriefCard />
      </div>

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
              className="inline-flex min-h-11 items-center text-sm font-medium text-accent"
            >
              Se nettoförmögenhet →
            </Link>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3">
            <Metric
              label="Likvida medel"
              value={<MoneyValue value={data.position.availableCash} />}
            />
            <Metric
              label="Investeringar"
              value={
                <Link
                  href="/investments"
                  aria-label="Öppna investeringar"
                  className="inline-flex min-h-11 min-w-11 items-center hover:text-accent"
                >
                  <MoneyValue value={data.position.investments} />
                </Link>
              }
            />
            <Metric
              label="Skuld"
              value={
                <Link
                  href="/debt"
                  aria-label="Öppna skulder"
                  className="inline-flex min-h-11 min-w-11 items-center hover:text-accent"
                >
                  <MoneyValue value={data.position.debt} />
                </Link>
              }
            />
          </div>
        </div>
      </section>

      <SpendingVsNormalCard />

      <section className="rounded-[18px] bg-surface-elevated p-5 shadow-[var(--ffos-shadow-soft)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-text-secondary">Kommande</h2>
          <Link
            href="/calendar"
            className="inline-flex min-h-11 items-center text-sm text-accent"
          >
            Kalender →
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

      <details className="group rounded-[18px] border border-border bg-surface-elevated">
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
          <span>
            <span className="block font-medium text-text-primary">Fördjupa bilden</span>
            <span className="mt-1 block text-sm text-text-muted">
              Likviditet, prognos, möjligheter, kassaflöde och datatäckning
            </span>
          </span>
          <span className="text-sm font-medium text-accent group-open:hidden">Visa</span>
          <span className="hidden text-sm font-medium text-accent group-open:inline">
            Dölj
          </span>
        </summary>
        <div className="space-y-4 border-t border-border p-4 md:p-5">
          {data.availableToInvest ? (
        <section
          aria-labelledby="available-to-invest-heading"
          className="rounded-[18px] bg-surface-elevated p-5 shadow-[var(--ffos-shadow-soft)]"
        >
          <div className="flex items-center justify-between gap-3">
            <h2
              id="available-to-invest-heading"
              className="text-sm font-medium text-text-secondary"
            >
              Tillgängligt överskott
            </h2>
            <Link
              href="/liquidity"
              className="inline-flex min-h-11 items-center text-sm text-accent"
            >
              Likviditet →
            </Link>
          </div>
          <p className="mt-1 text-2xl font-medium tracking-tight text-text-primary">
            <MoneyValue value={data.availableToInvest.amount} />
          </p>
          <p className="mt-2 text-xs text-text-muted">
            {data.availableToInvest.disclaimer} Detta är en beräkning, inte
            investeringsrådgivning.
          </p>
          <details className="mt-3 text-sm">
            <summary className="flex min-h-11 cursor-pointer select-none items-center text-accent">
              Så räknas det fram
            </summary>
            <ul className="mt-2 space-y-1 text-xs text-text-secondary">
              {data.availableToInvest.assumptions.map((assumption, index) => (
                <li key={index}>· {assumption}</li>
              ))}
            </ul>
            <dl className="mt-3 grid gap-1 text-xs text-text-muted">
              <div className="flex justify-between gap-3">
                <dt>Minimikassa</dt>
                <dd>
                  <MoneyValue value={data.availableToInvest.deductions.minimumCashBalance} />
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Buffertmål</dt>
                <dd>
                  <MoneyValue value={data.availableToInvest.deductions.emergencyFundTarget} />
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Säkerhetsmarginal</dt>
                <dd>
                  <MoneyValue value={data.availableToInvest.deductions.safetyMargin} />
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Reserverade buffertposter</dt>
                <dd>
                  <MoneyValue value={data.availableToInvest.deductions.reservedSinkingFunds} />
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Kommande 30 dagars utbetalningar</dt>
                <dd>
                  <MoneyValue value={data.availableToInvest.deductions.upcoming30dOutflows} />
                </dd>
              </div>
            </dl>
          </details>
          <p className="mt-3 text-sm">
            <Link
              href="/savings"
              className="inline-flex min-h-11 items-center font-medium text-accent"
            >
              Vad kan jag göra med överskottet? →
            </Link>
          </p>
        </section>
      ) : null}

      <section className="rounded-[18px] bg-surface-elevated p-5 shadow-[var(--ffos-shadow-soft)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-text-secondary">
            Prognos (kassaförändring)
          </h2>
          <Link
            href="/forecast"
            className="inline-flex min-h-11 items-center text-sm text-accent"
          >
            Visa mer
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <ForecastCell label="30 dagar" value={data.forecast.days30} />
          <ForecastCell label="60 dagar" value={data.forecast.days60} />
          <ForecastCell label="90 dagar" value={data.forecast.days90} />
        </div>
        <p className="mt-3 text-xs text-text-muted">
          Enkel riktning baserad på månadens nuvarande inkomster och utgifter.
        </p>
      </section>

      <section className="rounded-[18px] bg-surface-elevated p-5 shadow-[var(--ffos-shadow-soft)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-text-secondary">Möjligheter</h2>
          <Link
            href="/opportunities"
            className="inline-flex min-h-11 items-center text-sm text-accent"
          >
            Alla
          </Link>
        </div>
        {opportunities.length === 0 ? (
          <p className="text-sm text-text-muted">
            Inga aktiva förslag just nu. Nya möjligheter visas när mer data finns.
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
                    {effortLabels[item.effort] ?? "Insats ej bedömd"}
                    {item.confidence != null
                      ? ` · ${(item.confidence * 100).toFixed(0)} % säkerhet`
                      : ""}
                  </p>
                </div>
                {item.estimatedAnnualSaving ? (
                  <div className="shrink-0 text-right text-sm">
                    <MoneyValue value={item.estimatedAnnualSaving} />
                    <p className="text-xs text-text-muted">/ år</p>
                    {item.estimateBasis ? (
                      <p className="mt-1 max-w-[10rem] text-[11px] text-text-muted">
                        {item.estimateBasis}
                      </p>
                    ) : null}
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
            <Link
              href="/cashflow"
              className="inline-flex min-h-11 items-center text-sm text-accent"
            >
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
            freshness={data.coverageFreshness ?? []}
          />
        </section>
      </div>
        </div>
      </details>
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
