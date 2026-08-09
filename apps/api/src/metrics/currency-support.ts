import type { CurrencyCode } from "@ffos/domain";

export {
  assertAggregatableCurrency,
  UnsupportedCurrencyException,
} from "../common/currency-policy";

/**
 * How the aggregate copes with accounts it may not include.
 *
 * The rule itself lives in `common/currency-policy.ts` and is enforced at every
 * boundary that can create or move money. This module is only the reporting
 * half: a household that already holds an account in another currency still
 * gets a working dashboard, with an honest note about what is missing from the
 * total and no invented exchange rate.
 */

export type CurrencyBearingAccount = {
  id: string;
  name: string;
  currency: string;
  archivedAt?: Date | string | null;
};

export type UnsupportedCurrencyAccount = {
  id: string;
  name: string;
  currency: string;
  archived: boolean;
};

function isArchived(account: CurrencyBearingAccount): boolean {
  return account.archivedAt != null;
}

/**
 * Split accounts into the ones the base-currency total may include and the ones
 * it may not.
 *
 * Nothing outside the household's own currency is ever summed, so the total
 * stays true; the excluded accounts are reported instead of silently dropped.
 */
export function partitionByAggregationCurrency<T extends CurrencyBearingAccount>(
  accountRows: T[],
  baseCurrency: CurrencyCode,
): { aggregatable: T[]; unsupported: UnsupportedCurrencyAccount[] } {
  const aggregatable: T[] = [];
  const unsupported: UnsupportedCurrencyAccount[] = [];
  for (const account of accountRows) {
    if (account.currency === baseCurrency) {
      aggregatable.push(account);
      continue;
    }
    unsupported.push({
      id: account.id,
      name: account.name,
      currency: account.currency,
      archived: isArchived(account),
    });
  }
  return { aggregatable, unsupported };
}

/**
 * What the participant is told. An archived account needs no action, so it is
 * excluded from the total without nagging about it — which is also what makes
 * archiving a working remediation for an account created before this guard.
 */
export function activeCurrencyWarnings(
  unsupported: UnsupportedCurrencyAccount[],
): UnsupportedCurrencyAccount[] {
  return unsupported.filter((account) => !account.archived);
}
