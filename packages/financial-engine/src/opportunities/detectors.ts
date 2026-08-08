import { monthlyInterestFromRateMinor } from "../debt";
import type { LifestyleCreepResult } from "../lifestyle-creep";
import { calculateAvailableToInvest } from "../available-to-invest";
import {
  OPPORTUNITY_CALCULATION_VERSION,
  OPPORTUNITY_THRESHOLDS,
  type DetectedOpportunity,
  type OpportunityFact,
} from "./types";
import { buildConfidence, buildPriority, opportunityInputHash } from "./scoring";

function finish(
  partial: Omit<
    DetectedOpportunity,
    "confidence" | "priority" | "calculationVersion" | "inputHash"
  > & {
    confidenceInput: Parameters<typeof buildConfidence>[0];
    hashParts: string[];
  },
): DetectedOpportunity {
  const confidence = buildConfidence(partial.confidenceInput);
  const priority = buildPriority({
    annualImpactMinor: partial.estimatedAnnualImpactMinor,
    confidenceScore: confidence.confidenceScore,
    effort: partial.effort,
    risk: partial.risk,
  });
  return {
    identityKey: partial.identityKey,
    type: partial.type,
    detectorKey: partial.detectorKey,
    title: partial.title,
    description: partial.description,
    estimatedAnnualImpactMinor: partial.estimatedAnnualImpactMinor,
    estimatedMonthlyImpactMinor: partial.estimatedMonthlyImpactMinor,
    estimateBasis: partial.estimateBasis,
    assumptions: partial.assumptions,
    facts: partial.facts,
    dataSources: partial.dataSources,
    confidence,
    priority,
    effort: partial.effort,
    risk: partial.risk,
    evidence: partial.evidence,
    asOf: partial.asOf,
    calculationVersion: OPPORTUNITY_CALCULATION_VERSION,
    inputHash: opportunityInputHash(partial.hashParts),
  };
}

/**
 * Deterministic mortgage rate *scenario* opportunity.
 * Does NOT claim a bank will offer the comparison rate.
 */
export function detectMortgageRateOpportunity(input: {
  asOf: string;
  principalMinor: bigint;
  currentAnnualRateBps: number;
  scenarioCutBps?: number;
  mortgageAccountId?: string | null;
  rateAsOf?: string | null;
}): DetectedOpportunity | null {
  const cut = input.scenarioCutBps ?? OPPORTUNITY_THRESHOLDS.mortgageScenarioCutBps;
  if (input.principalMinor < OPPORTUNITY_THRESHOLDS.mortgageMinPrincipalMinor) {
    return null;
  }
  if (input.currentAnnualRateBps <= cut) return null;

  const scenarioBps = input.currentAnnualRateBps - cut;
  const monthlyCurrent = monthlyInterestFromRateMinor(
    input.principalMinor,
    input.currentAnnualRateBps,
  );
  const monthlyScenario = monthlyInterestFromRateMinor(
    input.principalMinor,
    scenarioBps,
  );
  const monthlyDiff = monthlyCurrent - monthlyScenario;
  const annualDiff = monthlyDiff * 12n;
  if (annualDiff < OPPORTUNITY_THRESHOLDS.mortgageMinAnnualImpactMinor) {
    return null;
  }

  const facts: OpportunityFact[] = [
    {
      key: "principal",
      label: "Utestående belopp",
      value: `${input.principalMinor} öre`,
      amountMinor: input.principalMinor.toString(),
    },
    {
      key: "currentRateBps",
      label: "Nuvarande ränta",
      value: `${(input.currentAnnualRateBps / 100).toFixed(2)} %`,
    },
    {
      key: "scenarioRateBps",
      label: "Jämförelsescenario",
      value: `${(scenarioBps / 100).toFixed(2)} % (−${cut} bp)`,
    },
    {
      key: "grossAnnualDiff",
      label: "Brutto årsdifferens (scenario)",
      value: `${annualDiff} öre/år`,
      amountMinor: annualDiff.toString(),
    },
  ];

  return finish({
    identityKey: `MORTGAGE_RATE:${input.mortgageAccountId ?? "primary"}`,
    type: "MORTGAGE_RATE",
    detectorKey: "mortgage-rate",
    title: "Granska bolåneränta (scenario)",
    description:
      "Potentiell bruttoskillnad i årsränta vid ett jämförelsescenario. Inte ett bankerbjudande.",
    estimatedAnnualImpactMinor: annualDiff,
    estimatedMonthlyImpactMinor: monthlyDiff,
    estimateBasis: `Scenario: −${cut} bp på utestående belopp × ränta (brutto, före avgifter).`,
    assumptions: [
      "Jämförelseräntan är ett scenario — inte ett garanterat erbjudande.",
      "Beräkning ≈ principal × ränta / 12 (utan amorteringsprofil eller avgifter).",
      "Skatteeffekter och bindningstid ingår inte.",
    ],
    facts,
    dataSources: ["accounts.interestRateBps", "ledger.outstanding"],
    confidenceInput: {
      coverageScore: input.mortgageAccountId ? 0.9 : 0.5,
      freshnessScore: input.rateAsOf ? 0.85 : 0.55,
      sampleSizeScore: 0.8,
      sourceReliabilityScore: 0.85,
    },
    effort: "medium",
    risk: "low",
    evidence: [
      ...(input.mortgageAccountId
        ? [
            {
              kind: "account" as const,
              id: input.mortgageAccountId,
              label: "Bolån",
              href: `/accounts/${input.mortgageAccountId}`,
            },
          ]
        : []),
      { kind: "page", id: "debt", label: "Skulder", href: "/debt" },
    ],
    asOf: input.asOf,
    hashParts: [
      "mortgage",
      input.principalMinor.toString(),
      String(input.currentAnnualRateBps),
      String(cut),
      input.asOf,
    ],
  });
}

/**
 * Subscription / recurring price increase from a normalized monthly series.
 * Series must be like-for-like monthly amounts (already cadence-normalized).
 */
export function detectSubscriptionPriceIncrease(input: {
  asOf: string;
  subscriptionId: string;
  name: string;
  /** Ascending monthly amounts (öre), oldest → newest */
  monthlyAmountSeries: bigint[];
}): DetectedOpportunity | null {
  const series = input.monthlyAmountSeries.filter((a) => a > 0n);
  if (series.length < 2) return null;
  const current = series[series.length - 1]!;
  const previous = series[series.length - 2]!;
  if (current <= previous) return null;

  // Require non-decreasing recent steps for "sustained" (last 3 if available)
  if (series.length >= 3) {
    const a = series[series.length - 3]!;
    const b = series[series.length - 2]!;
    const c = series[series.length - 1]!;
    if (!(a <= b && b <= c && c > a)) return null;
  }

  const abs = current - previous;
  const pct = previous > 0n ? Number((abs * 10000n) / previous) / 100 : 100;
  if (
    abs < OPPORTUNITY_THRESHOLDS.recurringAbsoluteIncreaseMinor &&
    pct < OPPORTUNITY_THRESHOLDS.recurringPercentIncrease
  ) {
    return null;
  }

  const annual = abs * 12n;
  return finish({
    identityKey: `SUBSCRIPTION_PRICE_INCREASE:${input.subscriptionId}`,
    type: "SUBSCRIPTION_PRICE_INCREASE",
    detectorKey: "subscription-price-increase",
    title: `Prishöjning: ${input.name}`,
    description: `Månadsbelopp ökade från ${previous} till ${current} öre (${pct.toFixed(1)} %).`,
    estimatedAnnualImpactMinor: annual,
    estimatedMonthlyImpactMinor: abs,
    estimateBasis:
      "Deterministisk: (aktuellt månadsbelopp − föregående) × 12. Trösklar i OPPORTUNITY_THRESHOLDS.",
    assumptions: [
      `Absoluttröskel ${OPPORTUNITY_THRESHOLDS.recurringAbsoluteIncreaseMinor} öre/mån eller ≥${OPPORTUNITY_THRESHOLDS.recurringPercentIncrease} %.`,
      "Serien är normaliserad till månadsbelopp (samma cadence).",
      "Inte en prognos om framtida höjningar.",
    ],
    facts: [
      {
        key: "previousMonthly",
        label: "Föregående månadsbelopp",
        value: `${previous} öre`,
        amountMinor: previous.toString(),
      },
      {
        key: "currentMonthly",
        label: "Aktuellt månadsbelopp",
        value: `${current} öre`,
        amountMinor: current.toString(),
      },
      {
        key: "percentIncrease",
        label: "Ökning",
        value: `${pct.toFixed(1)} %`,
      },
      {
        key: "series",
        label: "Serie (öre)",
        value: series.map(String).join(" → "),
      },
    ],
    dataSources: ["subscriptions", "source_transactions.merchant"],
    confidenceInput: {
      coverageScore: 0.85,
      freshnessScore: 0.8,
      sampleSizeScore: clampSample(series.length),
      sourceReliabilityScore: 0.8,
    },
    effort: "low",
    risk: "low",
    evidence: [
      {
        kind: "subscription",
        id: input.subscriptionId,
        label: input.name,
        href: "/subscriptions",
      },
    ],
    asOf: input.asOf,
    hashParts: [
      "sub-price",
      input.subscriptionId,
      series.map(String).join(","),
      input.asOf,
    ],
  });
}

function clampSample(n: number): number {
  if (n >= 6) return 1;
  if (n >= 3) return 0.75;
  if (n >= 2) return 0.5;
  return 0.2;
}

/** Recurring cost increase (insurance/telecom/etc.) — same math as subscription. */
export function detectRecurringCostIncrease(input: {
  asOf: string;
  recurringItemId: string;
  name: string;
  monthlyAmountSeries: bigint[];
}): DetectedOpportunity | null {
  const base = detectSubscriptionPriceIncrease({
    asOf: input.asOf,
    subscriptionId: input.recurringItemId,
    name: input.name,
    monthlyAmountSeries: input.monthlyAmountSeries,
  });
  if (!base) return null;
  return {
    ...base,
    identityKey: `RECURRING_COST_INCREASE:${input.recurringItemId}`,
    type: "RECURRING_COST_INCREASE",
    detectorKey: "recurring-cost-increase",
    title: `Återkommande kostnad upp: ${input.name}`,
  };
}

export function detectCashSurplusOpportunity(input: {
  asOf: string;
  availableCashMinor: bigint;
  minimumCashBalanceMinor: bigint;
  emergencyFundTargetMinor: bigint;
  safetyMarginMinor: bigint;
  reservedSinkingFundMinor: bigint;
  upcoming30dOutflowMinor: bigint;
}): DetectedOpportunity | null {
  const result = calculateAvailableToInvest({
    availableCashMinor: input.availableCashMinor,
    minimumCashBalanceMinor: input.minimumCashBalanceMinor,
    emergencyFundTargetMinor: input.emergencyFundTargetMinor,
    safetyMarginMinor: input.safetyMarginMinor,
    reservedSinkingFundMinor: input.reservedSinkingFundMinor,
    upcoming30dOutflowMinor: input.upcoming30dOutflowMinor,
  });
  if (result.availableToInvestMinor < OPPORTUNITY_THRESHOLDS.cashSurplusMinMinor) {
    return null;
  }
  return finish({
    identityKey: "CASH_SURPLUS:household",
    type: "CASH_SURPLUS",
    detectorKey: "cash-surplus",
    title: "Möjligt kassaöverskott (policy)",
    description:
      "Likvida medel efter buffert, reserver och kommande 30-dagars utbetalningar — samma formel som Available to Invest.",
    estimatedAnnualImpactMinor: null,
    estimatedMonthlyImpactMinor: result.availableToInvestMinor,
    estimateBasis:
      "Deterministisk policy: available_to_invest (inte investeringsråd).",
    assumptions: result.assumptions,
    facts: [
      {
        key: "availableCash",
        label: "Likvida medel",
        value: `${input.availableCashMinor} öre`,
        amountMinor: input.availableCashMinor.toString(),
      },
      {
        key: "totalDeducted",
        label: "Avdrag totalt",
        value: `${result.deductions.totalDeductedMinor} öre`,
        amountMinor: result.deductions.totalDeductedMinor.toString(),
      },
      {
        key: "surplus",
        label: "Potentiellt överskott",
        value: `${result.availableToInvestMinor} öre`,
        amountMinor: result.availableToInvestMinor.toString(),
      },
    ],
    dataSources: ["available_to_invest", "household_settings", "sinking_funds"],
    confidenceInput: {
      coverageScore: 0.85,
      freshnessScore: 0.8,
      sampleSizeScore: 0.7,
      sourceReliabilityScore: 0.9,
    },
    effort: "low",
    risk: "moderate",
    evidence: [
      { kind: "page", id: "dashboard", label: "Översikt", href: "/" },
      { kind: "page", id: "goals", label: "Mål / sinking", href: "/goals" },
    ],
    asOf: input.asOf,
    hashParts: [
      "cash-surplus",
      input.availableCashMinor.toString(),
      result.availableToInvestMinor.toString(),
      input.asOf,
    ],
  });
}

export function detectBudgetOverrunOpportunity(input: {
  asOf: string;
  plannedMinor: bigint;
  actualMinor: bigint;
  /** 0..1 fraction of budget period elapsed */
  periodProgress: number;
  /** Forecast remaining spend for rest of period (öre) */
  forecastRemainingSpendMinor: bigint;
}): DetectedOpportunity | null {
  if (input.periodProgress < OPPORTUNITY_THRESHOLDS.budgetMinPeriodProgress) {
    return null;
  }
  if (input.plannedMinor <= 0n) return null;
  const projectedTotal = input.actualMinor + input.forecastRemainingSpendMinor;
  if (projectedTotal <= input.plannedMinor) return null;
  const overrun = projectedTotal - input.plannedMinor;
  if (overrun < OPPORTUNITY_THRESHOLDS.budgetOverrunMinMinor) return null;
  const pct = Number((overrun * 10000n) / input.plannedMinor) / 100;

  return finish({
    identityKey: "BUDGET_OVERRUN:current-period",
    type: "BUDGET_OVERRUN",
    detectorKey: "budget-overrun",
    title: "Prognostiserat budgetöverskridande",
    description: `Prognos ${projectedTotal} öre mot planerat ${input.plannedMinor} öre (${pct.toFixed(1)} % över).`,
    estimatedAnnualImpactMinor: overrun,
    estimatedMonthlyImpactMinor: overrun,
    estimateBasis:
      "Deterministisk: actual + forecastRemaining − planned (endast om periodProgress ≥ 25 %).",
    assumptions: [
      "Forecast för återstående period är linjär/enkel — osäkerhet ökar tidigt i perioden.",
      `Tröskel periodProgress ≥ ${OPPORTUNITY_THRESHOLDS.budgetMinPeriodProgress}.`,
    ],
    facts: [
      {
        key: "planned",
        label: "Planerat",
        value: `${input.plannedMinor} öre`,
        amountMinor: input.plannedMinor.toString(),
      },
      {
        key: "actual",
        label: "Faktiskt hittills",
        value: `${input.actualMinor} öre`,
        amountMinor: input.actualMinor.toString(),
      },
      {
        key: "projected",
        label: "Prognostiserat totalt",
        value: `${projectedTotal} öre`,
        amountMinor: projectedTotal.toString(),
      },
      {
        key: "periodProgress",
        label: "Period framskriden",
        value: `${(input.periodProgress * 100).toFixed(0)} %`,
      },
    ],
    dataSources: ["budget_lines", "financial_events", "forecast"],
    confidenceInput: {
      coverageScore: 0.8,
      freshnessScore: 0.75,
      sampleSizeScore: clamp01progress(input.periodProgress),
      sourceReliabilityScore: 0.7,
    },
    effort: "medium",
    risk: "moderate",
    evidence: [{ kind: "page", id: "budget", label: "Budget", href: "/budget" }],
    asOf: input.asOf,
    hashParts: [
      "budget",
      input.plannedMinor.toString(),
      projectedTotal.toString(),
      input.asOf,
    ],
  });
}

function clamp01progress(p: number): number {
  return Math.min(1, Math.max(0, p));
}

export function detectSpendingTrendOpportunity(
  creep: LifestyleCreepResult,
  asOf: string,
): DetectedOpportunity | null {
  if (!creep.creeping) return null;
  if (
    creep.deltaPercent != null &&
    creep.deltaPercent < OPPORTUNITY_THRESHOLDS.spendingTrendMinPercent
  ) {
    return null;
  }
  const annual = creep.deltaMinor > 0n ? creep.deltaMinor * 12n : null;
  return finish({
    identityKey: "SPENDING_TREND:household",
    type: "SPENDING_TREND",
    detectorKey: "spending-trend",
    title: "Utgiftstrend uppåt",
    description: `Senaste 3 mån snitt vs 12-mån baseline: +${
      creep.deltaPercent?.toFixed(1) ?? "?"
    } %.`,
    estimatedAnnualImpactMinor: annual,
    estimatedMonthlyImpactMinor: creep.deltaMinor > 0n ? creep.deltaMinor : null,
    estimateBasis:
      "Deterministisk periodjämförelse: 3-mån snitt − 12-mån baseline (lifestyle-creep-motor).",
    assumptions: [
      "Baseline = föregående 12 månader före senaste 3.",
      "Interna överföringar / investeringar / amortering exkluderas där period-metrics stödjer det.",
    ],
    facts: [
      {
        key: "recent",
        label: "Senaste 3 mån snitt",
        value: `${creep.recentAvgMonthlyMinor} öre`,
        amountMinor: creep.recentAvgMonthlyMinor.toString(),
      },
      {
        key: "baseline",
        label: "Baseline 12 mån",
        value: `${creep.baselineAvgMonthlyMinor} öre`,
        amountMinor: creep.baselineAvgMonthlyMinor.toString(),
      },
      {
        key: "delta",
        label: "Differens / mån",
        value: `${creep.deltaMinor} öre`,
        amountMinor: creep.deltaMinor.toString(),
      },
    ],
    dataSources: ["financial_events.period", "categories"],
    confidenceInput: {
      coverageScore: 0.8,
      freshnessScore: 0.85,
      sampleSizeScore: 0.85,
      sourceReliabilityScore: 0.85,
    },
    effort: "medium",
    risk: "moderate",
    evidence: [
      { kind: "page", id: "cashflow", label: "Kassaflöde", href: "/cashflow" },
      ...creep.drivers.slice(0, 3).map((d) => ({
        kind: "category" as const,
        id: d.categoryKey,
        label: d.categoryName,
        href: `/transactions?q=${encodeURIComponent(d.categoryName)}`,
      })),
    ],
    asOf,
    hashParts: [
      "spend-trend",
      creep.recentAvgMonthlyMinor.toString(),
      creep.baselineAvgMonthlyMinor.toString(),
      asOf,
    ],
  });
}

/** Contract renewal — impact nullable (no fabricated alternative savings). */
export function detectContractRenewalOpportunity(input: {
  asOf: string;
  contracts: Array<{
    id: string;
    name: string;
    provider: string;
    renewalDate: string | null;
    endDate: string | null;
    cancellationDeadline: string | null;
    monthlyCostMinor: bigint | null;
    annualCostMinor: bigint | null;
    status: string;
  }>;
  daysAhead?: number;
}): DetectedOpportunity[] {
  const ahead = input.daysAhead ?? OPPORTUNITY_THRESHOLDS.contractRenewalDaysAhead;
  const asOf = new Date(`${input.asOf.slice(0, 10)}T00:00:00.000Z`);
  const limit = new Date(asOf);
  limit.setUTCDate(limit.getUTCDate() + ahead);

  const out: DetectedOpportunity[] = [];
  for (const c of input.contracts) {
    if (c.status !== "ACTIVE") continue;
    const deadline = c.cancellationDeadline ?? c.renewalDate ?? c.endDate;
    if (!deadline) continue;
    const dt = new Date(`${deadline.slice(0, 10)}T00:00:00.000Z`);
    if (dt < asOf || dt > limit) continue;
    const daysRemaining = Math.ceil(
      (dt.getTime() - asOf.getTime()) / (24 * 60 * 60 * 1000),
    );
    const annual =
      c.annualCostMinor ??
      (c.monthlyCostMinor != null ? c.monthlyCostMinor * 12n : null);

    out.push(
      finish({
        identityKey: `CONTRACT_RENEWAL:${c.id}`,
        type: "CONTRACT_RENEWAL",
        detectorKey: "contract-renewal",
        title: `Granska avtal: ${c.name}`,
        description: `${c.provider} — deadline ${deadline} (${daysRemaining} dagar). Ingen påhittad besparing.`,
        estimatedAnnualImpactMinor: null,
        estimatedMonthlyImpactMinor: c.monthlyCostMinor,
        estimateBasis:
          "Ingen besparingsuppskattning utan jämförelsedata. Påminnelse före uppsägnings-/förnyelsedatum.",
        assumptions: [
          "Alternativ leverantör / marknadspris saknas — impact = UNKNOWN.",
          `Fönster ${ahead} dagar från asOf.`,
        ],
        facts: [
          { key: "provider", label: "Leverantör", value: c.provider },
          { key: "deadline", label: "Deadline", value: deadline },
          {
            key: "daysRemaining",
            label: "Dagar kvar",
            value: String(daysRemaining),
          },
          ...(annual != null
            ? [
                {
                  key: "annualCost",
                  label: "Nuvarande årskostnad",
                  value: `${annual} öre`,
                  amountMinor: annual.toString(),
                },
              ]
            : []),
        ],
        dataSources: ["contracts"],
        confidenceInput: {
          coverageScore: 0.9,
          freshnessScore: 0.85,
          sampleSizeScore: 0.7,
          sourceReliabilityScore: 0.9,
        },
        effort: "medium",
        risk: "low",
        evidence: [
          {
            kind: "contract",
            id: c.id,
            label: c.name,
            href: "/contracts",
          },
        ],
        asOf: input.asOf,
        hashParts: ["contract", c.id, deadline, input.asOf],
      }),
    );
  }
  return out;
}

export function detectVehicleCostOpportunity(input: {
  asOf: string;
  vehicleId: string;
  name: string;
  monthlyEconomicCostMinor: bigint;
  negativeEquity: boolean;
  netEquityMinor: bigint;
}): DetectedOpportunity | null {
  if (
    input.monthlyEconomicCostMinor <
      OPPORTUNITY_THRESHOLDS.vehicleHighMonthlyCostMinor &&
    !input.negativeEquity
  ) {
    return null;
  }
  const annual = input.monthlyEconomicCostMinor * 12n;
  return finish({
    identityKey: `VEHICLE_COST:${input.vehicleId}`,
    type: "VEHICLE_COST",
    detectorKey: "vehicle-cost",
    title: `Hög fordonskostnad: ${input.name}`,
    description: input.negativeEquity
      ? "Negativ equity och/eller hög ekonomisk månadskostnad (TCO)."
      : "Ekonomisk månadskostnad över tröskel (TCO från kostnadsdata).",
    estimatedAnnualImpactMinor: annual,
    estimatedMonthlyImpactMinor: input.monthlyEconomicCostMinor,
    estimateBasis:
      "Deterministisk TCO från vehicle_cost_events (ekonomisk kostnad × 12).",
    assumptions: [
      `Tröskel ${OPPORTUNITY_THRESHOLDS.vehicleHighMonthlyCostMinor} öre/mån.`,
      "Inte ett byte-rekommendation — se VEHICLE_REPLACEMENT för TCO-jämförelse.",
    ],
    facts: [
      {
        key: "monthlyEconomic",
        label: "Ekonomisk / mån",
        value: `${input.monthlyEconomicCostMinor} öre`,
        amountMinor: input.monthlyEconomicCostMinor.toString(),
      },
      {
        key: "netEquity",
        label: "Nettoequity",
        value: `${input.netEquityMinor} öre`,
        amountMinor: input.netEquityMinor.toString(),
      },
      {
        key: "negativeEquity",
        label: "Negativ equity",
        value: input.negativeEquity ? "ja" : "nej",
      },
    ],
    dataSources: ["vehicle_cost_events", "vehicle_finance", "valuation"],
    confidenceInput: {
      coverageScore: 0.8,
      freshnessScore: 0.75,
      sampleSizeScore: 0.7,
      sourceReliabilityScore: 0.85,
    },
    effort: "high",
    risk: "moderate",
    evidence: [
      {
        kind: "vehicle",
        id: input.vehicleId,
        label: input.name,
        href: `/vehicles/${input.vehicleId}`,
      },
    ],
    asOf: input.asOf,
    hashParts: [
      "vehicle-cost",
      input.vehicleId,
      input.monthlyEconomicCostMinor.toString(),
      input.asOf,
    ],
  });
}

export function detectVehicleReplacementOpportunity(input: {
  asOf: string;
  vehicleId: string;
  name: string;
  recommendation: "replace" | "keep" | "marginal";
  monthlyDeltaMinor: bigint;
  analysisSource: string;
  confidence: number;
}): DetectedOpportunity | null {
  if (input.recommendation !== "replace") return null;
  if (input.monthlyDeltaMinor >= 0n) return null;
  const annual = -input.monthlyDeltaMinor * 12n;
  const mock = input.analysisSource.includes("mock");
  return finish({
    identityKey: `VEHICLE_REPLACEMENT:${input.vehicleId}`,
    type: "VEHICLE_REPLACEMENT",
    detectorKey: "vehicle-replacement",
    title: `Byte kan sänka TCO: ${input.name}`,
    description:
      "Keep-vs-replace baserat på total kostnad — inte enbart bränsle.",
    estimatedAnnualImpactMinor: annual,
    estimatedMonthlyImpactMinor: -input.monthlyDeltaMinor,
    estimateBasis:
      "Deterministisk keepVsReplace över kandidater; marknadsdata kan vara mock.",
    assumptions: [
      mock
        ? "Kandidatlistor/marknadspriser är MOCK_EXTERNAL_INPUT."
        : "Marknadskälla: live.",
      "Bytekostnad och equity ingår i motorn.",
    ],
    facts: [
      {
        key: "monthlyDelta",
        label: "Månadsdelta (keep − replace)",
        value: `${input.monthlyDeltaMinor} öre`,
        amountMinor: input.monthlyDeltaMinor.toString(),
      },
      {
        key: "analysisSource",
        label: "Datakälla",
        value: input.analysisSource,
      },
    ],
    dataSources: ["vehicle_intel.keepVsReplace", input.analysisSource],
    confidenceInput: {
      coverageScore: 0.7,
      freshnessScore: 0.7,
      sampleSizeScore: 0.6,
      sourceReliabilityScore: mock ? 0.4 : 0.75,
    },
    effort: "high",
    risk: "high",
    evidence: [
      {
        kind: "vehicle",
        id: input.vehicleId,
        label: input.name,
        href: `/vehicles/${input.vehicleId}/replacement`,
      },
      {
        kind: "page",
        id: "market",
        label: "Marknad",
        href: "/vehicles/market",
      },
    ],
    asOf: input.asOf,
    hashParts: [
      "vehicle-replace",
      input.vehicleId,
      input.monthlyDeltaMinor.toString(),
      input.asOf,
    ],
  });
}

export function rankOpportunities(
  items: Array<DetectedOpportunity | null | DetectedOpportunity[]>,
): DetectedOpportunity[] {
  const flat = items.flatMap((x) => (x == null ? [] : Array.isArray(x) ? x : [x]));
  return flat.sort(
    (a, b) =>
      b.priority.priorityScore - a.priority.priorityScore ||
      b.confidence.confidenceScore - a.confidence.confidenceScore,
  );
}
