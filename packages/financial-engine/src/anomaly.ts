/**
 * V1 deterministic anomaly rules — no ML.
 * Calculation version: anomaly-v1.0.0
 */

export const ANOMALY_CALCULATION_VERSION = "anomaly-v1.0.0";

export type AnomalyFinding = {
  id: string;
  ruleKey: string;
  title: string;
  detail: string;
  severity: "low" | "medium" | "high";
  entityId: string | null;
  entityKind: "transaction" | "recurring" | "income" | "other";
  amountMinor: bigint | null;
  asOf: string;
  facts: Array<{ key: string; label: string; value: string }>;
};

export const ANOMALY_THRESHOLDS = {
  /** Absolute size vs median of recent spend (multiplier). */
  largeTxnMedianMultiplier: 5,
  /** Min absolute amount to flag large txn (öre). */
  largeTxnMinMinor: 5_000_00n,
  /** Duplicate: same amount + merchant within N days. */
  duplicateWindowDays: 3,
  /** Missing income: days past expected. */
  missingIncomeGraceDays: 5,
} as const;

export function detectLargeTransaction(input: {
  asOf: string;
  transactionId: string;
  amountMinor: bigint;
  description: string;
  recentSpendAbsMinor: bigint[];
}): AnomalyFinding | null {
  const abs = input.amountMinor < 0n ? -input.amountMinor : input.amountMinor;
  if (abs < ANOMALY_THRESHOLDS.largeTxnMinMinor) return null;
  const sample = input.recentSpendAbsMinor.filter((x) => x > 0n).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  if (sample.length < 5) return null;
  const mid = sample[Math.floor(sample.length / 2)]!;
  if (mid <= 0n) return null;
  if (abs < mid * BigInt(ANOMALY_THRESHOLDS.largeTxnMedianMultiplier)) {
    return null;
  }
  return {
    id: `large-txn:${input.transactionId}`,
    ruleKey: "unusually_large_transaction",
    title: "Ovanligt stor transaktion",
    detail: `${input.description}: ${abs} öre vs median ${mid} öre.`,
    severity: abs > mid * 10n ? "high" : "medium",
    entityId: input.transactionId,
    entityKind: "transaction",
    amountMinor: input.amountMinor,
    asOf: input.asOf,
    facts: [
      { key: "amount", label: "Belopp", value: `${abs} öre` },
      { key: "median", label: "Median (recent)", value: `${mid} öre` },
      {
        key: "multiplier",
        label: "Tröskel",
        value: `${ANOMALY_THRESHOLDS.largeTxnMedianMultiplier}× median`,
      },
    ],
  };
}

export function detectDuplicateCandidate(input: {
  asOf: string;
  transactionId: string;
  otherTransactionId: string;
  amountMinor: bigint;
  merchantOrDesc: string;
  daysApart: number;
}): AnomalyFinding | null {
  if (input.daysApart > ANOMALY_THRESHOLDS.duplicateWindowDays) return null;
  const abs = input.amountMinor < 0n ? -input.amountMinor : input.amountMinor;
  if (abs <= 0n) return null;
  return {
    id: `dup:${input.transactionId}:${input.otherTransactionId}`,
    ruleKey: "duplicate_candidate",
    title: "Möjlig dubblett",
    detail: `Samma belopp (${abs} öre) och mottagare inom ${input.daysApart} dagar.`,
    severity: "medium",
    entityId: input.transactionId,
    entityKind: "transaction",
    amountMinor: input.amountMinor,
    asOf: input.asOf,
    facts: [
      { key: "pair", label: "Par", value: input.otherTransactionId },
      { key: "merchant", label: "Mottagare", value: input.merchantOrDesc },
      { key: "daysApart", label: "Dagar emellan", value: String(input.daysApart) },
    ],
  };
}

export function detectMissingExpectedIncome(input: {
  asOf: string;
  recurringItemId: string;
  name: string;
  nextExpectedOn: string;
}): AnomalyFinding | null {
  const asOf = new Date(`${input.asOf}T00:00:00.000Z`);
  const expected = new Date(`${input.nextExpectedOn}T00:00:00.000Z`);
  const days =
    (asOf.getTime() - expected.getTime()) / (24 * 60 * 60 * 1000);
  if (days < ANOMALY_THRESHOLDS.missingIncomeGraceDays) return null;
  return {
    id: `missing-income:${input.recurringItemId}`,
    ruleKey: "missing_expected_income",
    title: `Saknad förväntad inkomst: ${input.name}`,
    detail: `Förväntades ${input.nextExpectedOn}; ${Math.floor(days)} dagar sen.`,
    severity: days > 14 ? "high" : "medium",
    entityId: input.recurringItemId,
    entityKind: "income",
    amountMinor: null,
    asOf: input.asOf,
    facts: [
      { key: "expected", label: "Förväntat datum", value: input.nextExpectedOn },
      { key: "daysLate", label: "Dagar sen", value: String(Math.floor(days)) },
    ],
  };
}
