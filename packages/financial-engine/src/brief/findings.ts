/**
 * Financial Brief V2: structured findings, deterministic ranking, template
 * rendering and numeric grounding (§33–§44).
 *
 * Everything in this file is pure. The API layer assembles the inputs from
 * the deterministic services; nothing here queries, calls a model, or
 * formats a number it was not given the raw value for. AI appears only as a
 * *candidate text* passed into the grounding validator — and the validator
 * assumes it lies.
 */

export const FINDINGS_VERSION = "findings-1";
export const TEMPLATE_VERSION = "brief-templates-sv-1";

export type BriefFindingType =
  | "SPENDING_ABOVE_BASELINE"
  | "SPENDING_BELOW_BASELINE"
  | "CATEGORY_INCREASE"
  | "CATEGORY_DECREASE"
  | "SUBSCRIPTION_PRICE_INCREASE"
  | "NEW_SUBSCRIPTION"
  | "MISSING_EXPECTED_INCOME"
  | "UNUSUAL_TRANSACTION"
  | "LIQUIDITY_SHORTFALL"
  | "LIQUIDITY_SURPLUS"
  | "SAVINGS_RATE_CHANGE"
  | "RESERVE_INADEQUATE"
  | "UPCOMING_LARGE_OBLIGATION"
  | "DATA_COVERAGE_WARNING";

export type BriefFindingSeverity = "CRITICAL" | "WARNING" | "NOTICE" | "POSITIVE";

export type BriefFinding = {
  key: string;
  type: BriefFindingType;
  severity: BriefFindingSeverity;
  /** Absolute financial impact in minor units; 0n when not applicable. */
  impactMinor: bigint;
  confidence: number;
  /**
   * Display-ready named values ("+14,1 %", "1 660 kr", "Netflix"). The only
   * numbers allowed to appear in any rendered text (§39–§40).
   */
  fragments: Record<string, string>;
  values: Record<string, string | number | null>;
  explainRoute: string;
  dedupeGroup: string;
  asOf: string;
  fresh: boolean;
};

/* ------------------------------------------------------------------ */
/* Formatting: deterministic Swedish, no locale dependence.            */
/* ------------------------------------------------------------------ */

/** "1 660 kr" from minor units, rounded to whole kronor, sign preserved. */
export function formatKronor(minor: bigint): string {
  const negative = minor < 0n;
  const magnitude = negative ? -minor : minor;
  // Round to whole kronor (100 minor = 1 krona).
  const kronor = (magnitude + 50n) / 100n;
  const digits = kronor.toString();
  let grouped = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) grouped += "\u00a0";
    grouped += digits[i];
  }
  return `${negative ? "\u2212" : ""}${grouped}\u00a0kr`;
}

/** "+14,1 %" with Swedish decimal comma. */
export function formatPercent(value: number, decimals = 1): string {
  const sign = value > 0 ? "+" : value < 0 ? "\u2212" : "";
  const fixed = Math.abs(value).toFixed(decimals).replace(".", ",");
  return `${sign}${fixed}\u00a0%`;
}

/* ------------------------------------------------------------------ */
/* Finding builders: raw deterministic values in, findings out.        */
/* ------------------------------------------------------------------ */

export type FindingsInput = {
  asOf: string;
  /** Total spending this month vs. the 12-month baseline. */
  spendingBaseline?: {
    currentMonthMinor: bigint;
    baselineMedianMinor: bigint;
    monthsObserved: number;
    fresh: boolean;
  };
  categoryTrends?: Array<{
    categoryKey: string;
    categoryName: string;
    changeVsBaselinePercent: number;
    changeVsBaselineMinor: bigint;
    fresh: boolean;
  }>;
  subscriptionPriceChanges?: Array<{
    merchantName: string;
    previousAmountMinor: bigint;
    newAmountMinor: bigint;
    annualImpactMinor: bigint;
    recurringId: string;
  }>;
  newSubscriptions?: Array<{
    merchantName: string;
    monthlyAmountMinor: bigint;
    recurringId: string;
  }>;
  missingExpectedIncome?: Array<{
    label: string;
    expectedAmountMinor: bigint;
    expectedDate: string;
  }>;
  unusualTransactions?: Array<{
    description: string;
    amountMinor: bigint;
    date: string;
  }>;
  liquidity?: {
    availableMinor: bigint;
    requiredMinor: bigint;
    fresh: boolean;
  };
  savingsRate?: {
    currentPercent: number;
    targetPercent: number;
    fresh: boolean;
  };
  reserve?: {
    coverageMonths: number;
    targetMonths: number;
    fresh: boolean;
  };
  upcomingLargeObligations?: Array<{
    label: string;
    amountMinor: bigint;
    dueDate: string;
  }>;
  coverage?: {
    missingAreas: string[];
  };
};

/** Below this relative change, a baseline deviation is noise, not a finding. */
const SPENDING_DEVIATION_THRESHOLD_PERCENT = 10;
const CATEGORY_DEVIATION_THRESHOLD_PERCENT = 10;
/** Liquidity deviations below one thousand kronor are not worth a brief slot. */
const LIQUIDITY_DEVIATION_FLOOR_MINOR = 100_000n;

export function buildFindings(input: FindingsInput): BriefFinding[] {
  const findings: BriefFinding[] = [];
  const asOf = input.asOf;

  if (input.spendingBaseline && input.spendingBaseline.monthsObserved >= 3) {
    const { currentMonthMinor, baselineMedianMinor, fresh } = input.spendingBaseline;
    if (baselineMedianMinor > 0n) {
      const deltaMinor = currentMonthMinor - baselineMedianMinor;
      const deltaPercent = Number((deltaMinor * 1000n) / baselineMedianMinor) / 10;
      if (Math.abs(deltaPercent) >= SPENDING_DEVIATION_THRESHOLD_PERCENT) {
        const above = deltaMinor > 0n;
        findings.push({
          key: above ? "spending-above-baseline" : "spending-below-baseline",
          type: above ? "SPENDING_ABOVE_BASELINE" : "SPENDING_BELOW_BASELINE",
          severity: above ? "WARNING" : "POSITIVE",
          impactMinor: deltaMinor < 0n ? -deltaMinor : deltaMinor,
          confidence: Math.min(1, input.spendingBaseline.monthsObserved / 12) * (fresh ? 1 : 0.6),
          fragments: {
            delta: formatPercent(deltaPercent),
            amount: formatKronor(deltaMinor < 0n ? -deltaMinor : deltaMinor),
          },
          values: { deltaPercent, deltaMinor: deltaMinor.toString() },
          explainRoute: "/cashflow",
          dedupeGroup: "total-spending",
          asOf,
          fresh,
        });
      }
    }
  }

  for (const trend of input.categoryTrends ?? []) {
    if (Math.abs(trend.changeVsBaselinePercent) < CATEGORY_DEVIATION_THRESHOLD_PERCENT) {
      continue;
    }
    const increase = trend.changeVsBaselinePercent > 0;
    const impact =
      trend.changeVsBaselineMinor < 0n
        ? -trend.changeVsBaselineMinor
        : trend.changeVsBaselineMinor;
    findings.push({
      key: `category-${increase ? "increase" : "decrease"}-${trend.categoryKey}`,
      type: increase ? "CATEGORY_INCREASE" : "CATEGORY_DECREASE",
      severity: increase ? "WARNING" : "POSITIVE",
      impactMinor: impact,
      confidence: 0.85 * (trend.fresh ? 1 : 0.6),
      fragments: {
        categoryName: trend.categoryName,
        delta: formatPercent(trend.changeVsBaselinePercent),
        amount: formatKronor(impact),
      },
      values: {
        categoryKey: trend.categoryKey,
        changeVsBaselinePercent: trend.changeVsBaselinePercent,
        changeVsBaselineMinor: trend.changeVsBaselineMinor.toString(),
      },
      explainRoute: `/transactions?categoryKey=${encodeURIComponent(trend.categoryKey)}`,
      /*
       * Category findings share the dedupe group with total spending: "food
       * up 14 %" and "spending up 8 %" are usually the same story (§44), and
       * ranking keeps the stronger one.
       */
      dedupeGroup: "total-spending",
      asOf,
      fresh: trend.fresh,
    });
  }

  for (const change of input.subscriptionPriceChanges ?? []) {
    findings.push({
      key: `subscription-price-${change.recurringId}`,
      type: "SUBSCRIPTION_PRICE_INCREASE",
      severity: "WARNING",
      impactMinor:
        change.annualImpactMinor < 0n
          ? -change.annualImpactMinor
          : change.annualImpactMinor,
      confidence: 0.95,
      fragments: {
        merchant: change.merchantName,
        oldPrice: formatKronor(change.previousAmountMinor),
        newPrice: formatKronor(change.newAmountMinor),
        annualImpact: formatKronor(change.annualImpactMinor),
      },
      values: {
        recurringId: change.recurringId,
        previousAmountMinor: change.previousAmountMinor.toString(),
        newAmountMinor: change.newAmountMinor.toString(),
        annualImpactMinor: change.annualImpactMinor.toString(),
      },
      explainRoute: "/subscriptions",
      dedupeGroup: `subscription-${change.recurringId}`,
      asOf,
      fresh: true,
    });
  }

  for (const sub of input.newSubscriptions ?? []) {
    findings.push({
      key: `new-subscription-${sub.recurringId}`,
      type: "NEW_SUBSCRIPTION",
      severity: "NOTICE",
      impactMinor: sub.monthlyAmountMinor * 12n,
      confidence: 0.85,
      fragments: {
        merchant: sub.merchantName,
        monthlyPrice: formatKronor(sub.monthlyAmountMinor),
      },
      values: {
        recurringId: sub.recurringId,
        monthlyAmountMinor: sub.monthlyAmountMinor.toString(),
      },
      explainRoute: "/subscriptions",
      dedupeGroup: `subscription-${sub.recurringId}`,
      asOf,
      fresh: true,
    });
  }

  for (const missing of input.missingExpectedIncome ?? []) {
    findings.push({
      key: `missing-income-${missing.expectedDate}-${missing.label}`,
      type: "MISSING_EXPECTED_INCOME",
      severity: "CRITICAL",
      impactMinor: missing.expectedAmountMinor,
      confidence: 0.9,
      fragments: {
        label: missing.label,
        amount: formatKronor(missing.expectedAmountMinor),
      },
      values: {
        expectedDate: missing.expectedDate,
        expectedAmountMinor: missing.expectedAmountMinor.toString(),
      },
      explainRoute: "/subscriptions",
      dedupeGroup: `missing-income-${missing.label}`,
      asOf,
      fresh: true,
    });
  }

  for (const anomaly of input.unusualTransactions ?? []) {
    const magnitude = anomaly.amountMinor < 0n ? -anomaly.amountMinor : anomaly.amountMinor;
    findings.push({
      key: `unusual-${anomaly.date}-${magnitude.toString()}`,
      type: "UNUSUAL_TRANSACTION",
      severity: "NOTICE",
      impactMinor: magnitude,
      confidence: 0.8,
      fragments: {
        amount: formatKronor(magnitude),
        description: anomaly.description,
      },
      values: { date: anomaly.date, amountMinor: anomaly.amountMinor.toString() },
      explainRoute: "/transactions",
      dedupeGroup: `unusual-${anomaly.date}`,
      asOf,
      fresh: true,
    });
  }

  if (input.liquidity) {
    const { availableMinor, requiredMinor, fresh } = input.liquidity;
    const delta = availableMinor - requiredMinor;
    const magnitude = delta < 0n ? -delta : delta;
    if (magnitude >= LIQUIDITY_DEVIATION_FLOOR_MINOR && fresh) {
      /*
       * Current-state claims require fresh data (§43): a liquidity statement
       * from stale balances is omitted entirely, not shown with a caveat.
       */
      const shortfall = delta < 0n;
      findings.push({
        key: shortfall ? "liquidity-shortfall" : "liquidity-surplus",
        type: shortfall ? "LIQUIDITY_SHORTFALL" : "LIQUIDITY_SURPLUS",
        severity: shortfall ? "CRITICAL" : "POSITIVE",
        impactMinor: magnitude,
        confidence: 0.9,
        fragments: { amount: formatKronor(magnitude) },
        values: {
          availableMinor: availableMinor.toString(),
          requiredMinor: requiredMinor.toString(),
        },
        explainRoute: "/intelligence/liquidity",
        dedupeGroup: "liquidity",
        asOf,
        fresh,
      });
    }
  }

  if (input.savingsRate?.fresh) {
    const delta = input.savingsRate.currentPercent - input.savingsRate.targetPercent;
    if (Math.abs(delta) >= 5) {
      findings.push({
        key: "savings-rate-change",
        type: "SAVINGS_RATE_CHANGE",
        severity: delta < 0 ? "WARNING" : "POSITIVE",
        impactMinor: 0n,
        confidence: 0.8,
        fragments: {
          rate: formatPercent(input.savingsRate.currentPercent, 0).replace("+", ""),
          delta: formatPercent(delta, 0),
        },
        values: {
          currentPercent: input.savingsRate.currentPercent,
          targetPercent: input.savingsRate.targetPercent,
        },
        explainRoute: "/cashflow",
        dedupeGroup: "savings-rate",
        asOf,
        fresh: true,
      });
    }
  }

  if (input.reserve?.fresh && input.reserve.coverageMonths < input.reserve.targetMonths) {
    findings.push({
      key: "reserve-inadequate",
      type: "RESERVE_INADEQUATE",
      severity: "WARNING",
      impactMinor: 0n,
      confidence: 0.85,
      fragments: {
        months: String(Math.round(input.reserve.coverageMonths * 10) / 10).replace(
          ".",
          ",",
        ),
        targetMonths: String(input.reserve.targetMonths).replace(".", ","),
      },
      values: {
        coverageMonths: input.reserve.coverageMonths,
        targetMonths: input.reserve.targetMonths,
      },
      explainRoute: "/intelligence/liquidity",
      dedupeGroup: "liquidity",
      asOf,
      fresh: true,
    });
  }

  for (const obligation of input.upcomingLargeObligations ?? []) {
    findings.push({
      key: `upcoming-${obligation.dueDate}-${obligation.label}`,
      type: "UPCOMING_LARGE_OBLIGATION",
      severity: "NOTICE",
      impactMinor: obligation.amountMinor,
      confidence: 0.85,
      fragments: {
        label: obligation.label,
        amount: formatKronor(obligation.amountMinor),
        date: obligation.dueDate,
      },
      values: {
        dueDate: obligation.dueDate,
        amountMinor: obligation.amountMinor.toString(),
      },
      explainRoute: "/cashflow",
      dedupeGroup: `upcoming-${obligation.label}`,
      asOf,
      fresh: true,
    });
  }

  if (input.coverage && input.coverage.missingAreas.length > 0) {
    /*
     * §42: incomplete coverage is itself a finding. The brief must never say
     * "no risks" while whole areas of the household's finances are missing.
     */
    findings.push({
      key: "data-coverage-warning",
      type: "DATA_COVERAGE_WARNING",
      severity: "NOTICE",
      impactMinor: 0n,
      confidence: 1,
      fragments: { areas: input.coverage.missingAreas.join(", ") },
      values: { missingAreas: input.coverage.missingAreas.join(",") },
      explainRoute: "/settings",
      dedupeGroup: "coverage",
      asOf,
      fresh: true,
    });
  }

  return findings;
}

/* ------------------------------------------------------------------ */
/* Ranking + duplicate suppression (§35, §44).                         */
/* ------------------------------------------------------------------ */

const SEVERITY_ORDER: Record<BriefFindingSeverity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  NOTICE: 2,
  POSITIVE: 3,
};

/**
 * Deterministic order: severity, then financial impact, then confidence,
 * then key for total stability. No model is consulted (§35).
 */
export function rankFindings(findings: readonly BriefFinding[]): BriefFinding[] {
  return [...findings].sort((a, b) => {
    const severity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severity !== 0) return severity;
    if (a.impactMinor !== b.impactMinor) return a.impactMinor > b.impactMinor ? -1 : 1;
    if (a.confidence !== b.confidence) return b.confidence - a.confidence;
    return a.key.localeCompare(b.key);
  });
}

/**
 * One finding per dedupe group, strongest first (§44). Input must already be
 * ranked; the first of each group survives.
 */
export function suppressDuplicates(ranked: readonly BriefFinding[]): BriefFinding[] {
  const seen = new Set<string>();
  const result: BriefFinding[] = [];
  for (const finding of ranked) {
    if (seen.has(finding.dedupeGroup)) continue;
    seen.add(finding.dedupeGroup);
    result.push(finding);
  }
  return result;
}

/** The brief shows 3–5 items (§36); coverage warnings never crowd out real findings. */
export function selectBriefFindings(findings: readonly BriefFinding[]): BriefFinding[] {
  const deduped = suppressDuplicates(rankFindings(findings));
  const real = deduped.filter((f) => f.type !== "DATA_COVERAGE_WARNING");
  const coverage = deduped.filter((f) => f.type === "DATA_COVERAGE_WARNING");
  const selected = real.slice(0, coverage.length > 0 ? 4 : 5);
  return [...selected, ...coverage.slice(0, 1)];
}

/* ------------------------------------------------------------------ */
/* Template rendering: the mandatory, AI-free brief (§37).             */
/* ------------------------------------------------------------------ */

const TEMPLATES: Record<BriefFindingType, (f: Record<string, string>) => string> = {
  SPENDING_ABOVE_BASELINE: (f) =>
    `Utgifterna ligger ${f.delta} över ditt normala 12-månadersmönster (${f.amount} mer denna månad).`,
  SPENDING_BELOW_BASELINE: (f) =>
    `Utgifterna ligger ${f.delta} under ditt normala 12-månadersmönster (${f.amount} mindre denna månad).`,
  CATEGORY_INCREASE: (f) =>
    `Kostnaden för ${f.categoryName} ligger ${f.delta} över ditt normala 12-månadersmönster (${f.amount}).`,
  CATEGORY_DECREASE: (f) =>
    `Kostnaden för ${f.categoryName} ligger ${f.delta} under ditt normala 12-månadersmönster (${f.amount}).`,
  SUBSCRIPTION_PRICE_INCREASE: (f) =>
    `${f.merchant} har höjt priset från ${f.oldPrice} till ${f.newPrice} (${f.annualImpact} per år).`,
  NEW_SUBSCRIPTION: (f) =>
    `Ett nytt abonnemang upptäcktes: ${f.merchant} (${f.monthlyPrice} per månad).`,
  MISSING_EXPECTED_INCOME: (f) =>
    `En förväntad inkomst på ${f.amount} (${f.label}) har inte kommit in som väntat.`,
  UNUSUAL_TRANSACTION: (f) =>
    `En ovanligt stor transaktion på ${f.amount} upptäcktes.`,
  LIQUIDITY_SHORTFALL: (f) =>
    `Din tillgängliga kassa ligger ${f.amount} under din rekommenderade likviditetsnivå.`,
  LIQUIDITY_SURPLUS: (f) =>
    `Din tillgängliga kassa ligger cirka ${f.amount} över din rekommenderade likviditetsnivå.`,
  SAVINGS_RATE_CHANGE: (f) =>
    `Din sparkvot är ${f.rate} den här månaden, ${f.delta} mot ditt mål.`,
  RESERVE_INADEQUATE: (f) =>
    `Din buffert täcker ${f.months} månaders utgifter, under målet på ${f.targetMonths} månader.`,
  UPCOMING_LARGE_OBLIGATION: (f) =>
    `En större betalning på ${f.amount} (${f.label}) väntas ${f.date}.`,
  DATA_COVERAGE_WARNING: (f) =>
    `Delar av ekonomin saknar underlag (${f.areas}), så analysen är inte heltäckande.`,
};

const EXPLAIN_LABELS: Record<BriefFindingType, string> = {
  SPENDING_ABOVE_BASELINE: "Visa kassaflödet",
  SPENDING_BELOW_BASELINE: "Visa kassaflödet",
  CATEGORY_INCREASE: "Visa kategorin",
  CATEGORY_DECREASE: "Visa kategorin",
  SUBSCRIPTION_PRICE_INCREASE: "Visa abonnemanget",
  NEW_SUBSCRIPTION: "Visa abonnemanget",
  MISSING_EXPECTED_INCOME: "Visa förväntade transaktioner",
  UNUSUAL_TRANSACTION: "Visa transaktioner",
  LIQUIDITY_SHORTFALL: "Visa likviditet",
  LIQUIDITY_SURPLUS: "Visa likviditet",
  SAVINGS_RATE_CHANGE: "Visa kassaflödet",
  RESERVE_INADEQUATE: "Visa likviditet",
  UPCOMING_LARGE_OBLIGATION: "Visa kommande betalningar",
  DATA_COVERAGE_WARNING: "Visa inställningar",
};

export function renderTemplateText(finding: BriefFinding): string {
  return TEMPLATES[finding.type](finding.fragments);
}

export function explainLabel(type: BriefFindingType): string {
  return EXPLAIN_LABELS[type];
}

/** Headline severity summary: honest, never cheerful past the evidence. */
export function composeHeadline(findings: readonly BriefFinding[]): string {
  if (findings.length === 0) {
    return "Inga avvikelser att rapportera just nu.";
  }
  const worst = rankFindings(findings)[0]!;
  if (worst.severity === "CRITICAL") {
    return "Din ekonomi behöver uppmärksamhet.";
  }
  if (worst.severity === "WARNING") {
    const count = findings.filter((f) => f.type !== "DATA_COVERAGE_WARNING").length;
    return count === 1
      ? "Din ekonomi ser i huvudsak stabil ut. En sak är värd att titta på:"
      : `Din ekonomi ser i huvudsak stabil ut. ${countInSwedish(count)} saker är värda att titta på:`;
  }
  return "Din ekonomi ser stabil ut.";
}

function countInSwedish(count: number): string {
  const words = ["Noll", "En", "Två", "Tre", "Fyra", "Fem"];
  return words[count] ?? String(count);
}

/* ------------------------------------------------------------------ */
/* Numeric grounding (§39, §40).                                       */
/* ------------------------------------------------------------------ */

/**
 * Digit tokens in a text, normalized: separators removed, decimal comma
 * unified to a point. "1 660" and "1660" are the same token.
 */
export function extractNumberTokens(text: string): string[] {
  const compact = text.replace(/(\d)[\s\u00a0](\d)/g, "$1$2");
  const matches = compact.match(/\d+(?:[.,]\d+)?/g) ?? [];
  return matches.map((token) => token.replace(",", "."));
}

/**
 * Is every number in the candidate text sourced from the finding (§40)?
 *
 * The allowed set is the fragments plus the deterministic template text —
 * both rendered from engine values. Any digit sequence not present there
 * (an invented figure, a "rounded" percentage, a hallucinated year) fails
 * the whole text.
 */
export function isNumericallyGrounded(
  candidateText: string,
  finding: Pick<BriefFinding, "fragments" | "type">,
): boolean {
  const allowed = new Set<string>();
  for (const fragment of Object.values(finding.fragments)) {
    for (const token of extractNumberTokens(fragment)) allowed.add(token);
  }
  const template = TEMPLATES[finding.type](finding.fragments);
  for (const token of extractNumberTokens(template)) allowed.add(token);

  return extractNumberTokens(candidateText).every((token) => allowed.has(token));
}

/**
 * Merge AI texts with template fallback: an AI sentence that fails grounding
 * is discarded for that item, not "fixed" (§39). The brief never renders an
 * unvalidated number.
 */
export function mergeAiTexts(
  findings: readonly BriefFinding[],
  aiTexts: Record<string, string>,
): { texts: Map<string, string>; rejectedKeys: string[] } {
  const texts = new Map<string, string>();
  const rejectedKeys: string[] = [];
  for (const finding of findings) {
    const candidate = aiTexts[finding.key]?.trim();
    if (candidate && isNumericallyGrounded(candidate, finding)) {
      texts.set(finding.key, candidate);
    } else {
      if (candidate) rejectedKeys.push(finding.key);
      texts.set(finding.key, renderTemplateText(finding));
    }
  }
  return { texts, rejectedKeys };
}
