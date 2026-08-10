/**
 * Code-first Metric Registry (V1).
 *
 * Definitions live here so every surface shares the same metricKey + version.
 * Formula implementations remain in sibling engine modules; this catalog is the
 * contract that bumping a formula must update.
 */

export type MetricValueKind = "money_minor" | "ratio_percent" | "months" | "count";

export type MetricDefinition = {
  metricKey: string;
  displayName: string;
  formulaDescription: string;
  /** Semver for this metric's formula. Bump when meaning changes. */
  calculationVersion: string;
  valueKind: MetricValueKind;
  unit?: string;
};

/** Bundle version covering the shared household snapshot set. */
/** Bumped when the shared snapshot catalog set changes (P1-U2: available_to_invest). */
export const METRIC_BUNDLE_VERSION = "1.1.0";

export const METRIC_DEFINITIONS: readonly MetricDefinition[] = [
  {
    metricKey: "net_worth",
    displayName: "Nettoförmögenhet",
    formulaDescription:
      "available_cash + investments_total + assets_total − debt_total (ledger-aligned balances)",
    calculationVersion: "1.0.0",
    valueKind: "money_minor",
    unit: "minor",
  },
  {
    metricKey: "available_cash",
    displayName: "Tillgänglig likviditet",
    formulaDescription: "Sum of CHECKING + SAVINGS + CASH ledger balances",
    calculationVersion: "1.0.0",
    valueKind: "money_minor",
    unit: "minor",
  },
  {
    metricKey: "investments_total",
    displayName: "Investeringar",
    formulaDescription: "Sum of INVESTMENT + PENSION + CRYPTO ledger balances",
    calculationVersion: "1.0.0",
    valueKind: "money_minor",
    unit: "minor",
  },
  {
    metricKey: "assets_total",
    displayName: "Övriga tillgångar",
    formulaDescription: "Sum of ASSET ledger balances",
    calculationVersion: "1.0.0",
    valueKind: "money_minor",
    unit: "minor",
  },
  {
    metricKey: "debt_total",
    displayName: "Skulder",
    formulaDescription:
      "Signed sum of MORTGAGE + LOAN + CREDIT_CARD ledger balances (positive is owed; " +
      "a credit balance nets against debt, so net_worth subtracts exactly this)",
    calculationVersion: "1.0.0",
    valueKind: "money_minor",
    unit: "minor",
  },
  {
    metricKey: "income_period",
    displayName: "Periodinkomst",
    formulaDescription:
      "Sum of financial_events.incomeAmountMinor in the period (excl. internal transfer noise)",
    calculationVersion: "1.0.0",
    valueKind: "money_minor",
    unit: "minor",
  },
  {
    metricKey: "spending_period",
    displayName: "Periodutgifter",
    formulaDescription:
      "Sum of financial_events.expenseAmountMinor (consumption; refunds net; principal/investment transfers excluded)",
    calculationVersion: "1.0.0",
    valueKind: "money_minor",
    unit: "minor",
  },
  {
    metricKey: "savings_period",
    displayName: "Periodens sparande",
    formulaDescription: "income_period − spending_period",
    calculationVersion: "1.0.0",
    valueKind: "money_minor",
    unit: "minor",
  },
  {
    metricKey: "net_savings_rate",
    displayName: "Nettosparandegrad",
    formulaDescription:
      "savings_period / income_period × 100 when income > 0; else 0 (after-tax net baseline)",
    calculationVersion: "1.0.0",
    valueKind: "ratio_percent",
    unit: "percent",
  },
  {
    metricKey: "cash_runway_months",
    displayName: "Kassalikviditet (månader)",
    formulaDescription:
      "available_cash / monthly spending (current period); 0 when spending is 0",
    calculationVersion: "1.0.0",
    valueKind: "months",
    unit: "months",
  },
  {
    metricKey: "financial_coverage_percent",
    displayName: "Finansiell täckning",
    formulaDescription:
      "Share of expected household financial domains that are present in data sources/accounts",
    calculationVersion: "1.0.0",
    valueKind: "ratio_percent",
    unit: "percent",
  },
  {
    metricKey: "available_to_invest",
    displayName: "Tillgängligt att investera",
    formulaDescription:
      "max(0, available_cash − minimum_cash − emergency_fund_target − safety_margin − reserved_sinking_funds − upcoming_30d_outflows). Policy math — not investment advice.",
    calculationVersion: "1.0.0",
    valueKind: "money_minor",
    unit: "minor",
  },
] as const;

export type MetricKey = (typeof METRIC_DEFINITIONS)[number]["metricKey"];

const byKey = new Map(METRIC_DEFINITIONS.map((d) => [d.metricKey, d]));

export function listMetricDefinitions(): MetricDefinition[] {
  return METRIC_DEFINITIONS.map((d) => ({ ...d }));
}

export function getMetricDefinition(metricKey: string): MetricDefinition | null {
  return byKey.get(metricKey) ?? null;
}

export function requireMetricDefinition(metricKey: string): MetricDefinition {
  const def = getMetricDefinition(metricKey);
  if (!def) {
    throw new Error(`Unknown metricKey: ${metricKey}`);
  }
  return def;
}

/** Stable, non-cryptographic fingerprint for reproducibility metadata. */
export function metricInputHash(parts: Array<string | number | bigint>): string {
  const raw = parts.map((p) => String(p)).join("|");
  let h = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv1a_${(h >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * Fingerprint of per-metric calculation versions in the catalog.
 * Used as `metricMeta.calculationVersion` so it is never confused with
 * `METRIC_BUNDLE_VERSION` (bundle packaging vs formula versions).
 */
export function metricCatalogCalculationVersion(
  defs: readonly MetricDefinition[] = METRIC_DEFINITIONS,
): string {
  const parts = [...defs]
    .map((d) => `${d.metricKey}@${d.calculationVersion}`)
    .sort();
  return metricInputHash(parts);
}

/** Map of metricKey → calculationVersion for product meta payloads. */
export function metricVersionsMap(
  defs: readonly MetricDefinition[] = METRIC_DEFINITIONS,
): Record<string, string> {
  return Object.fromEntries(
    defs.map((d) => [d.metricKey, d.calculationVersion]),
  );
}
