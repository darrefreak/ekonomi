import { monthlyInterestFromRateMinor } from "./debt";

/**
 * Debt payoff ordering — which debt to clear first.
 *
 * Two established, deterministic methods:
 *
 *   avalanche — highest interest rate first. Minimises total interest paid;
 *               the mathematically optimal order.
 *   snowball  — smallest balance first. Clears whole debts sooner, which some
 *               households find easier to sustain.
 *
 * Nothing here moves money. It ranks existing liabilities and explains the
 * ranking. When a debt has no confirmed interest rate, a conservative
 * type-based assumption is used purely for ordering and flagged as assumed, so
 * the plan is still sensible before the household fills in real rates.
 */

export type DebtPayoffMethod = "avalanche" | "snowball";

export type LiabilityAccountType = "MORTGAGE" | "LOAN" | "CREDIT_CARD";

export interface PayoffDebtInput {
  id: string;
  name: string;
  provider: string | null;
  accountType: LiabilityAccountType;
  /** What is still owed, positive minor units. */
  outstandingMinor: bigint;
  /** Confirmed annual rate in basis points, or null when unknown. */
  interestRateBps: number | null;
}

export interface PayoffDebtResult {
  id: string;
  name: string;
  provider: string | null;
  accountType: LiabilityAccountType;
  priority: number;
  outstandingMinor: bigint;
  interestRateBps: number;
  assumedRate: boolean;
  monthlyInterestMinor: bigint;
  /** Share of total monthly interest across all debts, 0–1. */
  interestShare: number;
  reason: string;
}

export interface PayoffProjection {
  extraMonthlyMinor: bigint;
  /** Months to clear the focus debt with the extra amount, capped; null if it never clears. */
  focusMonthsToClear: number | null;
  /** Interest paid on the focus debt over that horizon. */
  focusInterestPaidMinor: bigint;
  /**
   * Interest avoided on the focus debt versus paying only its interest forever
   * over the same number of months (i.e. never reducing principal).
   */
  focusInterestSavedMinor: bigint;
}

export interface DebtPayoffPlan {
  method: DebtPayoffMethod;
  items: PayoffDebtResult[];
  focus: { id: string; name: string; reason: string } | null;
  totalOutstandingMinor: bigint;
  totalMonthlyInterestMinor: bigint;
  hasAssumedRates: boolean;
  projection: PayoffProjection | null;
}

/**
 * Conservative default annual rates (basis points) when a debt has no confirmed
 * rate. Ordered by how expensive each product type usually is in Sweden, so the
 * payoff order is right even before the household enters exact figures. These
 * are assumptions, always surfaced as such.
 */
export const ASSUMED_RATE_BPS: Record<LiabilityAccountType, number> = {
  CREDIT_CARD: 1_800, // account credits / cards: typically 15–20 %
  LOAN: 900, // unsecured "blanco" loans: typically 7–12 %
  MORTGAGE: 350, // secured housing loans: typically 3–4 %
};

const MAX_PROJECTION_MONTHS = 1_200; // 100 years — a "never clears" guard.

function effectiveRateBps(debt: PayoffDebtInput): {
  rateBps: number;
  assumed: boolean;
} {
  if (debt.interestRateBps != null && debt.interestRateBps > 0) {
    return { rateBps: debt.interestRateBps, assumed: false };
  }
  return { rateBps: ASSUMED_RATE_BPS[debt.accountType], assumed: true };
}

function ratePercentLabel(rateBps: number): string {
  return `${(rateBps / 100).toFixed(2).replace(".", ",")} %`;
}

/**
 * Rank debts and explain the ranking. Pure and deterministic: identical input
 * always yields identical output, including tie-breaks.
 */
export function planDebtPayoff(
  debts: PayoffDebtInput[],
  options: {
    method?: DebtPayoffMethod;
    extraMonthlyMinor?: bigint;
  } = {},
): DebtPayoffPlan {
  const method = options.method ?? "avalanche";

  // Only debts that actually owe something take part in the order.
  const active = debts.filter((d) => d.outstandingMinor > 0n);

  const enriched = active.map((debt) => {
    const { rateBps, assumed } = effectiveRateBps(debt);
    return {
      debt,
      rateBps,
      assumed,
      monthlyInterestMinor: monthlyInterestFromRateMinor(
        debt.outstandingMinor,
        rateBps,
      ),
    };
  });

  const totalMonthlyInterestMinor = enriched.reduce(
    (acc, e) => acc + e.monthlyInterestMinor,
    0n,
  );
  const totalOutstandingMinor = active.reduce(
    (acc, d) => acc + d.outstandingMinor,
    0n,
  );

  // Sort into payoff order. Deterministic tie-breaks keep the list stable.
  const sorted = [...enriched].sort((a, b) => {
    if (method === "snowball") {
      if (a.debt.outstandingMinor !== b.debt.outstandingMinor) {
        return a.debt.outstandingMinor < b.debt.outstandingMinor ? -1 : 1;
      }
      // Same balance: the pricier one first, then by name for total stability.
      if (a.rateBps !== b.rateBps) return b.rateBps - a.rateBps;
      return a.debt.name.localeCompare(b.debt.name, "sv");
    }
    // avalanche
    if (a.rateBps !== b.rateBps) return b.rateBps - a.rateBps;
    if (a.debt.outstandingMinor !== b.debt.outstandingMinor) {
      return a.debt.outstandingMinor > b.debt.outstandingMinor ? -1 : 1;
    }
    return a.debt.name.localeCompare(b.debt.name, "sv");
  });

  const items: PayoffDebtResult[] = sorted.map((e, index) => {
    const priority = index + 1;
    const interestShare =
      totalMonthlyInterestMinor > 0n
        ? Number(e.monthlyInterestMinor) / Number(totalMonthlyInterestMinor)
        : 0;
    return {
      id: e.debt.id,
      name: e.debt.name,
      provider: e.debt.provider,
      accountType: e.debt.accountType,
      priority,
      outstandingMinor: e.debt.outstandingMinor,
      interestRateBps: e.rateBps,
      assumedRate: e.assumed,
      monthlyInterestMinor: e.monthlyInterestMinor,
      interestShare,
      reason: buildReason(method, priority, e, sorted),
    };
  });

  const focusEntry = sorted[0];
  const focus = focusEntry
    ? {
        id: focusEntry.debt.id,
        name: focusEntry.debt.name,
        reason:
          method === "avalanche"
            ? `Högst ränta (${ratePercentLabel(focusEntry.rateBps)})${
                focusEntry.assumed ? ", antagen" : ""
              } — kostar mest att ha kvar.`
            : `Minst saldo — snabbast att bli helt av med.`,
      }
    : null;

  const hasAssumedRates = enriched.some((e) => e.assumed);

  let projection: PayoffProjection | null = null;
  const extra = options.extraMonthlyMinor ?? 0n;
  if (focusEntry && extra > 0n) {
    projection = projectFocusPayoff(focusEntry, extra);
  }

  return {
    method,
    items,
    focus,
    totalOutstandingMinor,
    totalMonthlyInterestMinor,
    hasAssumedRates,
    projection,
  };
}

function buildReason(
  method: DebtPayoffMethod,
  priority: number,
  entry: { rateBps: number; assumed: boolean; debt: PayoffDebtInput },
  sorted: Array<{ rateBps: number; debt: PayoffDebtInput }>,
): string {
  const rate = `${ratePercentLabel(entry.rateBps)}${entry.assumed ? " (antagen)" : ""}`;
  if (method === "avalanche") {
    if (priority === 1) return `Dyrast — börja här. Ränta ${rate}.`;
    const cheapest = sorted[sorted.length - 1];
    if (cheapest && entry.debt.id === cheapest.debt.id) {
      return `Billigast — ta sist. Ränta ${rate}.`;
    }
    return `Ränta ${rate}.`;
  }
  // snowball
  if (priority === 1) return `Minst saldo — snabbast att slutbetala.`;
  return `Ränta ${rate}.`;
}

/**
 * Project clearing the focus debt when a fixed extra amount is added each month
 * on top of covering its interest. Interest accrues monthly on the remaining
 * balance; the extra reduces principal. Deterministic month loop, capped.
 */
function projectFocusPayoff(
  entry: { debt: PayoffDebtInput; rateBps: number; monthlyInterestMinor: bigint },
  extraMonthlyMinor: bigint,
): PayoffProjection {
  let balance = entry.debt.outstandingMinor;
  let interestPaid = 0n;
  let months = 0;

  while (balance > 0n && months < MAX_PROJECTION_MONTHS) {
    const interest = monthlyInterestFromRateMinor(balance, entry.rateBps);
    balance = balance + interest - extraMonthlyMinor;
    interestPaid += interest;
    months += 1;
    // The extra alone cannot outrun the interest → it never clears.
    if (interest >= extraMonthlyMinor && balance >= entry.debt.outstandingMinor) {
      return {
        extraMonthlyMinor,
        focusMonthsToClear: null,
        focusInterestPaidMinor: interestPaid,
        focusInterestSavedMinor: 0n,
      };
    }
  }

  const cleared = balance <= 0n;
  // "Saved" versus paying only the interest for the same number of months while
  // never reducing the principal (the do-nothing baseline).
  const doNothingInterest = entry.monthlyInterestMinor * BigInt(months);
  const saved = doNothingInterest - interestPaid;

  return {
    extraMonthlyMinor,
    focusMonthsToClear: cleared ? months : null,
    focusInterestPaidMinor: interestPaid,
    focusInterestSavedMinor: saved > 0n ? saved : 0n,
  };
}
