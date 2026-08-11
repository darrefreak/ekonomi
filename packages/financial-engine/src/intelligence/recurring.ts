import { medianMinor, percentileMinor, robustVolatilityBps } from "./statistics";

/**
 * Recurrence detected from dates and amounts, without AI.
 *
 * §14 is explicit that periodicity is arithmetic, not language: a charge arriving
 * on the 4th of nine consecutive months is monthly whatever its description says.
 * AI is not consulted anywhere in this file.
 */

export type RecurrenceFrequency =
  | "WEEKLY"
  | "BIWEEKLY"
  | "FOUR_WEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "SEMIANNUAL"
  | "ANNUAL"
  | "VARIABLE"
  | "NONE";

/** What kind of commitment a recurring stream is (§15). Feeds forecasting. */
export type RecurringKind =
  | "SUBSCRIPTION"
  | "UTILITY_BILL"
  | "INSURANCE"
  | "MORTGAGE"
  | "LOAN_PAYMENT"
  | "SALARY"
  | "BENEFIT"
  | "TELECOM"
  | "MEMBERSHIP"
  | "CHILDCARE"
  | "ANNUAL_BILL"
  | "VARIABLE_RECURRING"
  | "OTHER_RECURRING";

export type RecurringOccurrence = {
  /** `YYYY-MM-DD`. */
  date: string;
  /** Signed minor units, as the bank reported it. */
  amountMinor: bigint;
};

export type RecurrenceDetection = {
  frequency: RecurrenceFrequency;
  /** 0–100. How much the intervals and amounts support the conclusion. */
  confidence: number;
  occurrences: number;
  /** Median gap in days between occurrences. */
  medianIntervalDays: number | null;
  /** Spread of the intervals, in days. Low means a dependable schedule. */
  intervalSpreadDays: number | null;
  /** Typical amount. Median, so one price change does not move it much. */
  medianAmountMinor: bigint | null;
  /** Spread of amounts in basis points of the median. */
  amountVolatilityBps: number | null;
  /** Most recent occurrence date. */
  lastSeen: string | null;
  firstSeen: string | null;
  /** Whether the amount is stable enough to call this a fixed price. */
  amountStable: boolean;
  /** Why this conclusion, for the "why am I seeing this" surface (§51). */
  reasons: string[];
};

/** Days between two `YYYY-MM-DD` dates, using UTC so no timezone shifts a day. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Candidate periods, in days, with the tolerance each accepts.
 *
 * Monthly is 30 days give or take 6, which covers month lengths and the way a
 * charge on the 31st lands on the 28th in February. Quarterly and annual get
 * proportionally wider windows because a yearly bill moving a fortnight is still
 * the same yearly bill.
 */
const PERIODS: Array<{ frequency: RecurrenceFrequency; days: number; tolerance: number }> = [
  { frequency: "WEEKLY", days: 7, tolerance: 2 },
  { frequency: "BIWEEKLY", days: 14, tolerance: 3 },
  { frequency: "FOUR_WEEKLY", days: 28, tolerance: 3 },
  { frequency: "MONTHLY", days: 30, tolerance: 6 },
  { frequency: "QUARTERLY", days: 91, tolerance: 12 },
  { frequency: "SEMIANNUAL", days: 182, tolerance: 20 },
  { frequency: "ANNUAL", days: 365, tolerance: 35 },
];

/** Amounts within 5% of their median count as a fixed price. */
const STABLE_AMOUNT_BPS = 500;

/**
 * Detect recurrence in one stream of occurrences.
 *
 * Two occurrences are never enough: any two dates are some interval apart, and
 * calling that a schedule is how a pair of unrelated purchases becomes a
 * "subscription". Three is the minimum, and confidence rises with count.
 */
export function detectRecurrence(
  occurrences: readonly RecurringOccurrence[],
): RecurrenceDetection {
  const sorted = [...occurrences].sort((a, b) => (a.date < b.date ? -1 : 1));
  const amounts = sorted.map((occurrence) => {
    const value = occurrence.amountMinor;
    return value < 0n ? -value : value;
  });
  const medianAmountMinor = medianMinor(amounts);
  const amountVolatilityBps = robustVolatilityBps(amounts);
  const amountStable =
    amountVolatilityBps !== null && amountVolatilityBps <= STABLE_AMOUNT_BPS;

  const base = {
    occurrences: sorted.length,
    medianAmountMinor,
    amountVolatilityBps,
    amountStable,
    lastSeen: sorted[sorted.length - 1]?.date ?? null,
    firstSeen: sorted[0]?.date ?? null,
  };

  if (sorted.length < 3) {
    return {
      ...base,
      frequency: "NONE",
      confidence: 0,
      medianIntervalDays: null,
      intervalSpreadDays: null,
      reasons: [
        `Endast ${sorted.length} förekomst${sorted.length === 1 ? "" : "er"} — för få för att avgöra en period.`,
      ],
    };
  }

  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    intervals.push(daysBetween(sorted[i - 1]!.date, sorted[i]!.date));
  }
  const intervalBigints = intervals.map((days) => BigInt(days));
  const medianIntervalRaw = medianMinor(intervalBigints);
  const medianIntervalDays = medianIntervalRaw === null ? null : Number(medianIntervalRaw);

  // Spread as the distance from median to the 90th percentile: one late payment
  // should not disqualify an otherwise dependable schedule.
  const p90 = percentileMinor(intervalBigints, 90);
  const intervalSpreadDays =
    medianIntervalDays === null || p90 === null
      ? null
      : Math.abs(Number(p90) - medianIntervalDays);

  const reasons: string[] = [];

  /*
   * A fixed frequency also requires the schedule to be consistent.
   *
   * The median alone is not enough: grocery runs at 3, 13, 14, 2 and 17 days apart
   * have a median of 13 and would otherwise be reported as biweekly, complete with
   * a projected due date the household could plan around. Requiring the spread to
   * sit inside the period's own tolerance is what separates a schedule from a
   * coincidence.
   */
  const scheduleConsistent = (tolerance: number): boolean =>
    intervalSpreadDays !== null && intervalSpreadDays <= tolerance;

  /*
   * The closest period, not the first one whose window happens to contain the
   * interval. The windows overlap by design — 28±3 and 30±6 both admit 31 days —
   * so taking the first match made list order decide, and a plain monthly
   * subscription came out as four-weekly.
   */
  const match =
    medianIntervalDays === null
      ? undefined
      : PERIODS.filter(
          (period) => Math.abs(medianIntervalDays - period.days) <= period.tolerance,
        ).sort(
          (a, b) =>
            Math.abs(medianIntervalDays - a.days) - Math.abs(medianIntervalDays - b.days),
        )[0];

  // A near-miss period with an inconsistent schedule is not that period.
  const periodic = match !== undefined && scheduleConsistent(match.tolerance);

  if (!match || !periodic || medianIntervalDays === null) {
    // Frequent but irregular: real recurring spending (a weekly-ish grocery run)
    // that must not be presented as a subscription with a due date.
    const frequentEnough = sorted.length >= 6 && (medianIntervalDays ?? 999) <= 45;
    return {
      ...base,
      frequency: frequentEnough ? "VARIABLE" : "NONE",
      confidence: frequentEnough ? 45 : 0,
      medianIntervalDays,
      intervalSpreadDays,
      reasons: frequentEnough
        ? [
            `${sorted.length} förekomster med ojämna mellanrum (median ${medianIntervalDays} dagar) — återkommande men utan fast schema.`,
          ]
        : [
            medianIntervalDays === null
              ? "Kunde inte beräkna intervall."
              : `Intervallen (median ${medianIntervalDays} dagar) matchar ingen känd period.`,
          ],
    };
  }

  /*
   * Confidence from evidence, not from a feeling.
   *
   * Occurrence count carries the most weight: twelve monthly charges are far
   * stronger evidence than three. Schedule tightness and amount stability add to
   * it, and a long gap since the last occurrence subtracts, because a cancelled
   * subscription should stop being described as active.
   */
  let confidence = 40;
  reasons.push(
    `${sorted.length} förekomster med ${medianIntervalDays} dagars median­intervall matchar ${match.frequency}.`,
  );

  const countBonus = Math.min(30, (sorted.length - 3) * 4);
  confidence += countBonus;
  if (countBonus > 0) reasons.push(`${sorted.length} förekomster stärker slutsatsen.`);

  // Reaching here means the schedule is already inside the period's tolerance.
  confidence += 15;
  reasons.push(`Schemat är jämnt (spridning ${intervalSpreadDays ?? 0} dagar).`);

  if (amountStable) {
    confidence += 10;
    reasons.push(
      `Beloppet är stabilt (${((amountVolatilityBps ?? 0) / 100).toFixed(1)} % avvikelse).`,
    );
  }

  return {
    ...base,
    frequency: match.frequency,
    confidence: Math.max(0, Math.min(100, confidence)),
    medianIntervalDays,
    intervalSpreadDays,
    reasons,
  };
}

/** How many months a frequency covers, for normalising cost to a month (§16). */
const PERIODS_PER_YEAR: Record<RecurrenceFrequency, number | null> = {
  WEEKLY: 52,
  BIWEEKLY: 26,
  FOUR_WEEKLY: 13,
  MONTHLY: 12,
  QUARTERLY: 4,
  SEMIANNUAL: 2,
  ANNUAL: 1,
  VARIABLE: null,
  NONE: null,
};

/**
 * Normalise a recurring cost to a month and a year.
 *
 * An annual insurance bill of 12 000 kr is 1 000 kr a month for planning, and
 * saying so is what makes a recurring-cost summary comparable (§18). Integer
 * arithmetic throughout; the monthly figure is floored, so a total built from
 * monthly figures is never larger than the annual one.
 */
export function normaliseRecurringCost(input: {
  amountMinor: bigint;
  frequency: RecurrenceFrequency;
}): { monthlyMinor: bigint | null; annualMinor: bigint | null } {
  const perYear = PERIODS_PER_YEAR[input.frequency];
  if (perYear === null) return { monthlyMinor: null, annualMinor: null };
  const magnitude = input.amountMinor < 0n ? -input.amountMinor : input.amountMinor;
  const annualMinor = magnitude * BigInt(perYear);
  return { monthlyMinor: annualMinor / 12n, annualMinor };
}

export type PriceChange = {
  fromMinor: bigint;
  toMinor: bigint;
  /** `YYYY-MM-DD` of the first occurrence at the new price. */
  changedOn: string;
  differenceMinor: bigint;
  percentChange: number | null;
};

export type PriceHistoryResult = {
  changes: PriceChange[];
  currentMinor: bigint | null;
  originalMinor: bigint | null;
  /** Total change from the first price to the current one. */
  totalDifferenceMinor: bigint | null;
  /** Extra cost per year at the current price versus the original. */
  annualImpactMinor: bigint | null;
};

/**
 * Find price changes in a recurring stream (§17).
 *
 * A change is only recorded when the new price then holds: a single odd amount
 * between two identical ones is a one-off adjustment, not a price rise, and
 * reporting it as one would fill the surface with noise the household cannot act
 * on.
 */
export function detectPriceChanges(input: {
  occurrences: readonly RecurringOccurrence[];
  frequency: RecurrenceFrequency;
  /** Ignore changes smaller than this share of the price, in basis points. */
  minimumChangeBps?: number;
}): PriceHistoryResult {
  const minimumChangeBps = input.minimumChangeBps ?? 200; // 2%
  const sorted = [...input.occurrences].sort((a, b) => (a.date < b.date ? -1 : 1));
  const amounts = sorted.map((occurrence) =>
    occurrence.amountMinor < 0n ? -occurrence.amountMinor : occurrence.amountMinor,
  );
  if (amounts.length < 2) {
    return {
      changes: [],
      currentMinor: amounts[0] ?? null,
      originalMinor: amounts[0] ?? null,
      totalDifferenceMinor: null,
      annualImpactMinor: null,
    };
  }

  const changes: PriceChange[] = [];
  let level = amounts[0]!;
  for (let i = 1; i < amounts.length; i++) {
    const amount = amounts[i]!;
    if (amount === level) continue;
    const difference = amount - level;
    const magnitude = difference < 0n ? -difference : difference;
    const base = level === 0n ? 1n : level;
    if (Number((magnitude * 10_000n) / base) < minimumChangeBps) continue;

    // Confirm the new level holds, unless this is the latest occurrence — the most
    // recent price is the one in force whether or not it repeats yet.
    const next = amounts[i + 1];
    const isLast = next === undefined;
    const holds = isLast || next === amount;
    if (!holds) continue;

    changes.push({
      fromMinor: level,
      toMinor: amount,
      changedOn: sorted[i]!.date,
      differenceMinor: difference,
      percentChange:
        level === 0n ? null : Number(((amount - level) * 1000n) / level) / 10,
    });
    level = amount;
  }

  const originalMinor = amounts[0]!;
  const currentMinor = amounts[amounts.length - 1]!;
  const perYear = PERIODS_PER_YEAR[input.frequency];
  const totalDifferenceMinor = currentMinor - originalMinor;
  return {
    changes,
    currentMinor,
    originalMinor,
    totalDifferenceMinor,
    annualImpactMinor:
      perYear === null ? null : totalDifferenceMinor * BigInt(perYear),
  };
}

/**
 * Classify what kind of recurring commitment this is (§15).
 *
 * Deterministic keyword matching against the signature, which is a starting point
 * rather than a verdict — the household's own correction outranks it, and an
 * unmatched stream stays `OTHER_RECURRING` instead of being guessed into a
 * category that changes how forecasting treats it.
 */
const KIND_KEYWORDS: Array<{ kind: RecurringKind; words: string[] }> = [
  { kind: "SALARY", words: ["LON", "LÖN", "SALARY", "ARBETSGIVARE"] },
  { kind: "MORTGAGE", words: ["BOLAN", "BOLÅN", "HYPOTEK", "AMORTERING"] },
  { kind: "LOAN_PAYMENT", words: ["LAN", "LÅN", "KREDIT", "AVBETALNING"] },
  { kind: "INSURANCE", words: ["FORSAKRING", "FÖRSÄKRING", "TRYGG", "LANSFORSAKRING", "FOLKSAM", "IF"] },
  { kind: "TELECOM", words: ["TELIA", "TELENOR", "TELE2", "COMVIQ", "BREDBAND", "MOBIL"] },
  { kind: "UTILITY_BILL", words: ["ELNAT", "ELNÄT", "VATTENFALL", "FORTUM", "EON", "ELAVTAL", "VARME", "VÄRME", "SOPOR"] },
  { kind: "CHILDCARE", words: ["FORSKOLA", "FÖRSKOLA", "BARNOMSORG", "FRITIDS"] },
  { kind: "MEMBERSHIP", words: ["MEDLEM", "FACK", "UNIONEN", "GYM", "SATS", "FRISKIS"] },
  { kind: "BENEFIT", words: ["FORSAKRINGSKASSAN", "FÖRSÄKRINGSKASSAN", "BARNBIDRAG", "CSN", "PENSION"] },
  { kind: "SUBSCRIPTION", words: ["NETFLIX", "SPOTIFY", "APPLE", "HBO", "VIAPLAY", "DISNEY", "STORYTEL", "AMAZON", "GOOGLE", "MICROSOFT", "ADOBE"] },
];

export function classifyRecurringKind(input: {
  signatureLabel: string;
  frequency: RecurrenceFrequency;
  /** Positive means money arriving. */
  direction: "INFLOW" | "OUTFLOW";
  amountStable: boolean;
}): { kind: RecurringKind; matched: boolean } {
  const haystack = input.signatureLabel.toUpperCase();
  // Short keywords such as "IF" (the insurer) or "LON" only count as whole
  // words — otherwise "SPOTIFY" contains "IF" and "SALONG" contains "LON".
  const tokens = new Set(haystack.split(/[^A-ZÅÄÖ0-9]+/u).filter(Boolean));
  const matches = (word: string) =>
    word.length <= 3 ? tokens.has(word) : haystack.includes(word);
  for (const { kind, words } of KIND_KEYWORDS) {
    if (!words.some(matches)) continue;
    // A keyword pointing at income cannot describe an outflow, and the reverse.
    const isIncomeKind = kind === "SALARY" || kind === "BENEFIT";
    if (isIncomeKind !== (input.direction === "INFLOW")) continue;
    return { kind, matched: true };
  }
  if (input.direction === "INFLOW") return { kind: "BENEFIT", matched: false };
  if (input.frequency === "ANNUAL") return { kind: "ANNUAL_BILL", matched: false };
  if (input.frequency === "VARIABLE") return { kind: "VARIABLE_RECURRING", matched: false };
  // A stable monthly outflow is subscription-shaped, but say it is a guess.
  if (input.amountStable && input.frequency === "MONTHLY") {
    return { kind: "SUBSCRIPTION", matched: false };
  }
  return { kind: "OTHER_RECURRING", matched: false };
}

/** Kinds a household would call a subscription, for the subscriptions surface. */
const SUBSCRIPTION_KINDS = new Set<RecurringKind>([
  "SUBSCRIPTION",
  "MEMBERSHIP",
  "TELECOM",
]);

export function isSubscriptionKind(kind: RecurringKind): boolean {
  return SUBSCRIPTION_KINDS.has(kind);
}

export type ExpectedOccurrence = {
  /** Earliest plausible date, `YYYY-MM-DD`. */
  earliestDate: string;
  /** Latest plausible date. */
  latestDate: string;
  /** Typical amount. */
  expectedAmountMinor: bigint;
  /** Range when the amount varies; equal to expected when it does not. */
  lowAmountMinor: bigint;
  highAmountMinor: bigint;
  confidence: number;
};

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Project the next occurrence of a recurring stream (§19).
 *
 * Returns a date range rather than a date, and an amount range when the amount
 * varies, because the honest answer to "when is the mortgage due" is a window. A
 * stream without a confident frequency projects nothing at all.
 */
export function projectNextOccurrence(input: {
  detection: RecurrenceDetection;
  occurrences: readonly RecurringOccurrence[];
  /** Minimum confidence before projecting. */
  minimumConfidence?: number;
}): ExpectedOccurrence | null {
  const { detection } = input;
  const minimum = input.minimumConfidence ?? 60;
  if (detection.confidence < minimum) return null;
  if (detection.medianIntervalDays === null || detection.lastSeen === null) return null;
  if (detection.frequency === "NONE" || detection.frequency === "VARIABLE") return null;

  const amounts = input.occurrences.map((occurrence) =>
    occurrence.amountMinor < 0n ? -occurrence.amountMinor : occurrence.amountMinor,
  );
  const expected = medianMinor(amounts);
  if (expected === null) return null;

  // Recent amounts describe the current price better than the whole history.
  const recent = amounts.slice(-4);
  const low = percentileMinor(recent, 10) ?? expected;
  const high = percentileMinor(recent, 90) ?? expected;

  const spread = Math.max(1, detection.intervalSpreadDays ?? 2);
  const centre = addDays(detection.lastSeen, detection.medianIntervalDays);
  return {
    earliestDate: addDays(centre, -spread),
    latestDate: addDays(centre, spread),
    expectedAmountMinor: expected,
    lowAmountMinor: low < expected ? low : expected,
    highAmountMinor: high > expected ? high : expected,
    confidence: detection.confidence,
  };
}

/**
 * Has an expected occurrence failed to arrive (§20)?
 *
 * Conservative: only after the projected window has fully passed, plus a grace
 * period, and only for streams that were confident to begin with. Telling a
 * household its salary is missing on the day it was due is how an alert surface
 * loses its credibility.
 */
export function detectMissingOccurrence(input: {
  expected: ExpectedOccurrence;
  /** `YYYY-MM-DD` — the household's today. */
  asOf: string;
  graceDays?: number;
}): { missing: boolean; daysOverdue: number } {
  const grace = input.graceDays ?? 3;
  const deadline = addDays(input.expected.latestDate, grace);
  if (input.asOf <= deadline) return { missing: false, daysOverdue: 0 };
  return { missing: true, daysOverdue: daysBetween(deadline, input.asOf) };
}
