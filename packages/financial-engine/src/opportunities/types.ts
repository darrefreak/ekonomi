/** V1 opportunity types — only emit when evidence exists. */
export type OpportunityType =
  | "MORTGAGE_RATE"
  | "SUBSCRIPTION_PRICE_INCREASE"
  | "UNUSED_OR_DUPLICATE_SUBSCRIPTION"
  | "RECURRING_COST_INCREASE"
  | "BANK_FEE"
  | "CREDIT_INTEREST"
  | "CASH_SURPLUS"
  | "BUDGET_OVERRUN"
  | "SPENDING_TREND"
  | "CONTRACT_RENEWAL"
  | "VEHICLE_COST"
  | "VEHICLE_REPLACEMENT"
  | "OTHER";

export type OpportunityEvidenceLink = {
  kind:
    | "account"
    | "subscription"
    | "contract"
    | "category"
    | "transaction"
    | "vehicle"
    | "page";
  id: string;
  label: string;
  href: string;
};

/** Structured fact for explainability (not AI prose). */
export type OpportunityFact = {
  key: string;
  label: string;
  value: string;
  amountMinor?: string;
};

export type ConfidenceBreakdown = {
  coverageScore: number;
  freshnessScore: number;
  sampleSizeScore: number;
  sourceReliabilityScore: number;
  /** Composite 0..1 */
  confidenceScore: number;
  label: "low" | "medium" | "high";
};

export type PriorityBreakdown = {
  impactScore: number;
  confidenceScore: number;
  easeScore: number;
  riskPenalty: number;
  /** Deterministic priority; higher = more important */
  priorityScore: number;
};

export type DetectedOpportunity = {
  /** Stable identity for dedupe: type + subject */
  identityKey: string;
  type: OpportunityType;
  detectorKey: string;
  title: string;
  description: string;
  estimatedAnnualImpactMinor: bigint | null;
  estimatedMonthlyImpactMinor: bigint | null;
  /** Human basis — scenario/approx labels, never "guaranteed". */
  estimateBasis: string;
  assumptions: string[];
  facts: OpportunityFact[];
  dataSources: string[];
  confidence: ConfidenceBreakdown;
  priority: PriorityBreakdown;
  effort: "low" | "medium" | "high";
  risk: "low" | "moderate" | "high";
  evidence: OpportunityEvidenceLink[];
  asOf: string;
  calculationVersion: string;
  inputHash: string;
};

/** Opportunity engine calculation catalog version (not bundle semver). */
export const OPPORTUNITY_CALCULATION_VERSION = "opp-v1.0.0";

/** Documented thresholds (versioned with OPPORTUNITY_CALCULATION_VERSION). */
export const OPPORTUNITY_THRESHOLDS = {
  /** Min absolute monthly increase to flag subscription/recurring price change (öre). */
  recurringAbsoluteIncreaseMinor: 10_00n,
  /** Min percent increase (e.g. 3 = 3%). */
  recurringPercentIncrease: 3,
  /** Mortgage scenario rate cut in bps (comparison only — not a bank offer). */
  mortgageScenarioCutBps: 25,
  /** Min principal to consider mortgage scenario. */
  mortgageMinPrincipalMinor: 100_000_00n,
  /** Min annual gross interest difference to surface mortgage opp. */
  mortgageMinAnnualImpactMinor: 1_200_00n,
  /** Cash surplus min to surface. */
  cashSurplusMinMinor: 10_000_00n,
  /** Budget overrun: min expected overrun and min period progress (0..1). */
  budgetOverrunMinMinor: 500_00n,
  budgetMinPeriodProgress: 0.25,
  /** Spending trend min relative increase. */
  spendingTrendMinPercent: 8,
  /** Contract renewal window days. */
  contractRenewalDaysAhead: 90,
  /** Vehicle economic cost threshold (monthly). */
  vehicleHighMonthlyCostMinor: 6_000_00n,
} as const;
