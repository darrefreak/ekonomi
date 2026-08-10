"use client";

import { useQuery } from "@tanstack/react-query";
import type { LiquidityRequirementResponse } from "@ffos/api-client";
import { api } from "@/lib/api";
import { describeError } from "@/lib/error-message";
import { useHouseholdId } from "@/lib/use-household-id";
import { MoneyValue } from "./money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

/**
 * How much readily available money this household actually needs.
 *
 * Every figure comes from the deterministic engine, computed from the household's
 * own months. The page's job is to make the reasoning visible: a single
 * recommended number with no breakdown is indistinguishable from a guess, so the
 * components, the basis and the confidence are all on the page rather than behind
 * a tooltip.
 */

const COMPONENT_LABELS: Record<string, string> = {
  OPERATING_CASH: "Löpande kassa",
  EMERGENCY_RESERVE: "Buffert",
  IRREGULAR_EXPENSE_RESERVE: "Ojämna kostnader",
  EXPENSE_VOLATILITY_BUFFER: "Kostnadsvariation",
  INCOME_RISK_BUFFER: "Inkomstrisk",
  UPCOMING_PLANNED_EXPENSES: "Kommande betalningar",
  SAFETY_MARGIN: "Säkerhetsmarginal",
  SINKING_FUNDS: "Öronmärkt sparande",
};

const CONFIDENCE_LABELS: Record<string, { text: string; tone: string }> = {
  HIGH: { text: "Hög säkerhet", tone: "text-positive" },
  MODERATE: { text: "Måttlig säkerhet", tone: "text-warning" },
  LOW: { text: "Låg säkerhet", tone: "text-negative" },
};

const RESILIENCE_LABELS: Record<string, { text: string; tone: string }> = {
  STRONG: { text: "Stark", tone: "text-positive" },
  MODERATE: { text: "Måttlig", tone: "text-warning" },
  WEAK: { text: "Svag", tone: "text-negative" },
  UNKNOWN: { text: "Okänd", tone: "text-text-muted" },
};

function kr(minor: string | null, currency = "SEK") {
  if (minor === null) return <span className="text-text-muted">–</span>;
  return <MoneyValue value={{ amountMinor: minor, currency: currency as "SEK" }} />;
}

function months(value: number | null) {
  if (value === null) return "–";
  return `${value.toString().replace(".", ",")} mån`;
}

export function LiquidityPage() {
  const householdId = useHouseholdId();
  const query = useQuery({
    queryKey: ["intelligence", householdId, "liquidity"],
    queryFn: () => api.getLiquidityRequirement(householdId!),
    enabled: Boolean(householdId),
  });

  if (!householdId || query.isLoading) {
    return <LoadingState label="Beräknar ditt likviditetsbehov…" />;
  }
  if (query.isError) {
    return (
      <ErrorState
        title="Kunde inte beräkna likviditetsbehovet"
        description={describeError(query.error, "Försök igen om en stund.")}
      />
    );
  }
  const data = query.data as LiquidityRequirementResponse;
  const { requirement, basis } = data;

  // Without months to reason from, the honest answer is that there is no answer.
  if (basis.monthsOfHistory < 3) {
    return (
      <div className="space-y-6">
        <Header asOf={data.asOf} />
        <EmptyState
          title="För lite historik ännu"
          description={`Behovet räknas ut från dina egna månader, och det finns ${basis.monthsOfHistory} hela ${basis.monthsOfHistory === 1 ? "månad" : "månader"}. Importera ett kontoutdrag med längre historik för en uppskattning.`}
        />
      </div>
    );
  }

  const confidence = CONFIDENCE_LABELS[requirement.confidence] ?? {
    text: requirement.confidence,
    tone: "text-text-muted",
  };
  const hasSurplus = BigInt(requirement.surplusMinor) > 0n;
  const hasShortfall = BigInt(requirement.shortfallMinor) > 0n;

  return (
    <div className="space-y-6">
      <Header asOf={data.asOf} />

      {/* The answer, then immediately what it is measured against. */}
      <section className="space-y-4 rounded-[16px] bg-surface-elevated p-5">
        <div>
          <p className="text-xs text-text-muted">Rekommenderad likviditet</p>
          <p className="mt-1 font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight tabular-nums">
            {kr(requirement.minimumMinor)} – {kr(requirement.conservativeMinor)}
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Mitten av intervallet är {kr(requirement.recommendedMinor)}.{" "}
            <span className={confidence.tone}>{confidence.text}.</span>
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-text-muted">Tillgängliga pengar</dt>
            <dd className="mt-0.5 tabular-nums">{kr(data.liquidCashMinor)}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">
              {hasShortfall ? "Saknas" : "Möjligt överskott"}
            </dt>
            <dd
              className={`mt-0.5 tabular-nums ${hasShortfall ? "text-warning" : hasSurplus ? "text-positive" : ""}`}
            >
              {kr(hasShortfall ? requirement.shortfallMinor : requirement.surplusMinor)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Räcker</dt>
            <dd className="mt-0.5 tabular-nums">
              {months(data.runway.essentialOnlyMonths)}
              <span className="text-text-muted"> vid enbart nödvändigt</span>
            </dd>
          </div>
        </dl>

        {requirement.confidenceReasons.length > 0 ? (
          <ul className="space-y-1 border-t border-border pt-3 text-xs text-text-secondary">
            {requirement.confidenceReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* The household's own target beside the derived reserve. Neither wins. */}
      {data.policyComparison ? (
        <section className="space-y-2 rounded-[16px] bg-surface-elevated p-5">
          <h2 className="text-sm font-medium text-text-secondary">
            Ditt mål och den beräknade nivån
          </h2>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-text-muted">Ditt inställda buffertmål</dt>
              <dd className="mt-0.5 tabular-nums">
                {kr(data.policyComparison.configuredEmergencyFundMinor)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Beräknad buffert ur din historik</dt>
              <dd className="mt-0.5 tabular-nums">
                {kr(data.policyComparison.derivedEmergencyReserveMinor)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Skillnad</dt>
              <dd className="mt-0.5 tabular-nums">
                {kr(data.policyComparison.differenceMinor)}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-text-muted">
            Det ena ersätter inte det andra. Ditt mål är ditt val; den beräknade
            nivån är vad dina egna kostnader antyder.
          </p>
        </section>
      ) : null}

      {/* Components: the total is a sum of stated parts, not a magic number. */}
      <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm font-medium text-text-secondary">Vad summan består av</h2>
        <ul className="divide-y divide-border">
          {requirement.components.map((component) => (
            <li key={component.key} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-sm">
                  {COMPONENT_LABELS[component.key] ?? component.key}
                </span>
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {kr(component.amountMinor)}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-text-muted">{component.reason}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Stress: the household's own worst months, not invented shocks. */}
      <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm font-medium text-text-secondary">Om något går fel</h2>
        <ul className="space-y-2">
          {data.stress.map((scenario) => (
            <li
              key={scenario.key}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <span className="min-w-0">{scenario.label}</span>
              <span
                className={`shrink-0 tabular-nums ${scenario.survives ? "text-text-secondary" : "text-negative"}`}
              >
                {kr(scenario.remainingCashMinor)}
                <span className="ml-2 text-xs">
                  {scenario.survives ? "klarar" : "räcker inte"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Backtest: what the recommendation would have done in the real past. */}
      {data.backtest.monthsTested > 0 ? (
        <section className="space-y-2 rounded-[16px] bg-surface-elevated p-5">
          <h2 className="text-sm font-medium text-text-secondary">
            Hade det räckt historiskt?
          </h2>
          <p className="text-sm text-text-secondary">
            Med den rekommenderade nivån hade du klarat{" "}
            <span className="font-medium tabular-nums">
              {data.backtest.monthsSurvived} av {data.backtest.monthsTested}
            </span>{" "}
            av dina egna månader.
            {data.backtest.breachCount > 0 ? (
              <>
                {" "}
                {data.backtest.breachCount} månad
                {data.backtest.breachCount === 1 ? "" : "er"} hade inte räckt.
              </>
            ) : null}
          </p>
          <p className="text-xs text-text-muted">
            Varje månad prövas mot vad rekommendationen hade varit *före* den
            månaden, så modellen inte får se det den testas på. Det är en historisk
            kontroll, ingen garanti om framtiden.
          </p>
          {data.backtest.breaches.length > 0 ? (
            <ul className="mt-1 space-y-1 text-xs text-text-secondary">
              {data.backtest.breaches.slice(0, 5).map((breach) => (
                <li key={breach.month} className="tabular-nums">
                  {breach.month}: saknades {kr(breach.shortfallMinor)}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {/* Resilience: dimensions, deliberately not one score. */}
      <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm font-medium text-text-secondary">Motståndskraft</h2>
        <ul className="divide-y divide-border">
          {data.resilience.dimensions.map((dimension) => {
            const level = RESILIENCE_LABELS[dimension.level] ?? {
              text: dimension.level,
              tone: "text-text-muted",
            };
            return (
              <li key={dimension.key} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-sm">{dimension.label}</span>
                  <span className={`shrink-0 text-sm ${level.tone}`}>{level.text}</span>
                </div>
                <p className="mt-0.5 text-xs text-text-muted">{dimension.detail}</p>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Basis: what the recommendation rests on. */}
      <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm font-medium text-text-secondary">Varför ser jag detta?</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-text-muted">Historik</dt>
            <dd className="mt-0.5">
              {basis.monthsOfHistory} månader
              {basis.firstMonth ? ` (${basis.firstMonth} – ${basis.lastMonth})` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Nödvändigt per månad, median</dt>
            <dd className="mt-0.5 tabular-nums">{kr(basis.essentialMedianMinor)}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Dyr månad (P90)</dt>
            <dd className="mt-0.5 tabular-nums">{kr(basis.essentialP90Minor)}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Inkomstens variation</dt>
            <dd className="mt-0.5 tabular-nums">
              {basis.incomeVolatilityBps === null
                ? "–"
                : `${(basis.incomeVolatilityBps / 100).toFixed(0)} %`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Täckning</dt>
            <dd className="mt-0.5 tabular-nums">
              {Math.round(basis.coveragePercent)} %
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Senaste data</dt>
            <dd className="mt-0.5 tabular-nums">
              {basis.dataAgeDays > 400 ? "–" : `${basis.dataAgeDays} dagar sedan`}
            </dd>
          </div>
        </dl>
        {basis.unknownNecessityShareBps !== null && basis.unknownNecessityShareBps > 1000 ? (
          <p className="text-xs text-warning">
            {(basis.unknownNecessityShareBps / 100).toFixed(0)} % av utgifterna saknar
            kategori och räknas som nödvändiga, vilket är det försiktiga antagandet.
            Kategorisera mer för en skarpare siffra.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function Header({ asOf }: { asOf: string }) {
  return (
    <div>
      <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
        Likviditet
      </h1>
      <p className="mt-2 text-sm text-text-secondary">
        Hur mycket lättillgängliga pengar ditt hushåll rimligen behöver, räknat ur
        din egen historik · per {asOf}
      </p>
    </div>
  );
}
