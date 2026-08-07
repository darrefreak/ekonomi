import { money, type CurrencyCode, type Money } from "@ffos/domain";
import { calculateNetWorth, type NetWorthInput } from "./net-worth";

export type TypedAccountBalance = {
  accountType: string;
  balanceMinor: bigint;
};

function absMinor(n: bigint): bigint {
  return n < 0n ? -n : n;
}

/** Bucket account balances into NW components (absolute liabilities). */
export function bucketBalancesForNetWorth(
  rows: TypedAccountBalance[],
  currency: CurrencyCode,
): NetWorthInput {
  const sumTypes = (types: string[], asLiability: boolean) =>
    rows
      .filter((r) => types.includes(r.accountType))
      .reduce(
        (acc, r) => acc + (asLiability ? absMinor(r.balanceMinor) : r.balanceMinor),
        0n,
      );

  return {
    cash: money(sumTypes(["CHECKING", "SAVINGS", "CASH"], false), currency),
    investments: money(
      sumTypes(["INVESTMENT", "PENSION", "CRYPTO"], false),
      currency,
    ),
    assets: money(sumTypes(["ASSET"], false), currency),
    liabilities: money(
      sumTypes(["MORTGAGE", "LOAN", "CREDIT_CARD"], true),
      currency,
    ),
  };
}

export function netWorthFromTypedBalances(
  rows: TypedAccountBalance[],
  currency: CurrencyCode,
): Money {
  return calculateNetWorth(bucketBalancesForNetWorth(rows, currency));
}

/** Month-end dates going back `monthsBack` months, plus asOf tip if needed. */
export function monthEndDates(asOf: string, monthsBack: number): string[] {
  const asOfDay = asOf.slice(0, 10);
  const [y, m] = asOf.slice(0, 7).split("-").map(Number);
  const dates: string[] = [];
  let year = y;
  let month = m;
  for (let i = 0; i < monthsBack; i += 1) {
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    if (end <= asOfDay) dates.unshift(end);
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  if (!dates.includes(asOfDay)) dates.push(asOfDay);
  return [...new Set(dates)].sort();
}
