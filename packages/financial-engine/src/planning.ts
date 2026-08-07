export type BudgetLineInput = {
  categoryKey: string;
  plannedMinor: bigint;
  actualMinor: bigint;
};

export type BudgetLineResult = BudgetLineInput & {
  remainingMinor: bigint;
  varianceMinor: bigint;
  utilizationPercent: number;
};

export function budgetRemaining(plannedMinor: bigint, actualMinor: bigint): bigint {
  return plannedMinor - actualMinor;
}

export function budgetLineVariance(
  plannedMinor: bigint,
  actualMinor: bigint,
): { remainingMinor: bigint; varianceMinor: bigint; utilizationPercent: number } {
  const remainingMinor = budgetRemaining(plannedMinor, actualMinor);
  const varianceMinor = actualMinor - plannedMinor;
  const utilizationPercent =
    plannedMinor === 0n
      ? actualMinor === 0n
        ? 0
        : 100
      : Number((actualMinor * 10_000n) / plannedMinor) / 100;
  return { remainingMinor, varianceMinor, utilizationPercent };
}

export function summarizeBudget(lines: BudgetLineInput[]) {
  let plannedMinor = 0n;
  let actualMinor = 0n;
  const detailed: BudgetLineResult[] = lines.map((line) => {
    plannedMinor += line.plannedMinor;
    actualMinor += line.actualMinor;
    const v = budgetLineVariance(line.plannedMinor, line.actualMinor);
    return { ...line, ...v };
  });
  const totals = budgetLineVariance(plannedMinor, actualMinor);
  return {
    plannedMinor,
    actualMinor,
    remainingMinor: totals.remainingMinor,
    varianceMinor: totals.varianceMinor,
    utilizationPercent: totals.utilizationPercent,
    lines: detailed,
  };
}

/** Roll leaf category spend into parent budget keys (e.g. food.groceries → food). */
export function rollupActualByBudgetKey(
  spends: Array<{ categoryKey: string; amountMinor: bigint }>,
  budgetKeys: string[],
): Map<string, bigint> {
  const map = new Map<string, bigint>(budgetKeys.map((k) => [k, 0n]));
  for (const spend of spends) {
    for (const key of budgetKeys) {
      if (spend.categoryKey === key || spend.categoryKey.startsWith(`${key}.`)) {
        map.set(key, (map.get(key) ?? 0n) + spend.amountMinor);
        break;
      }
    }
  }
  return map;
}

export function goalProgress(currentMinor: bigint, targetMinor: bigint) {
  const remainingMinor = targetMinor > currentMinor ? targetMinor - currentMinor : 0n;
  const percentComplete =
    targetMinor <= 0n
      ? 100
      : Math.min(100, Number((currentMinor * 10_000n) / targetMinor) / 100);
  return { remainingMinor, percentComplete };
}

export function monthsUntil(asOf: string, targetDate: string | null): number | null {
  if (!targetDate) return null;
  const [ay, am] = asOf.slice(0, 7).split("-").map(Number);
  const [ty, tm] = targetDate.slice(0, 7).split("-").map(Number);
  return (ty - ay) * 12 + (tm - am);
}

export function requiredMonthlyContribution(
  currentMinor: bigint,
  targetMinor: bigint,
  monthsRemaining: number | null,
): bigint {
  const remaining =
    targetMinor > currentMinor ? targetMinor - currentMinor : 0n;
  if (remaining === 0n) return 0n;
  if (monthsRemaining === null || monthsRemaining <= 0) return remaining;
  const months = BigInt(monthsRemaining);
  return (remaining + months - 1n) / months;
}

export function annualizeSubscription(
  amountMinor: bigint,
  cadence: "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY",
): bigint {
  switch (cadence) {
    case "WEEKLY":
      return amountMinor * 52n;
    case "MONTHLY":
      return amountMinor * 12n;
    case "QUARTERLY":
      return amountMinor * 4n;
    case "YEARLY":
      return amountMinor;
  }
}
