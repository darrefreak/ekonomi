import { HttpException, HttpStatus } from "@nestjs/common";
import type { CurrencyCode } from "@ffos/domain";

/**
 * V1 aggregates a household's position in one currency only. There is no FX
 * engine, so an account held in another currency cannot be added to the total
 * without inventing a rate.
 *
 * The rule is enforced in two places and they do different jobs:
 *
 *  - at the door, so unsupported state cannot be created (see
 *    `assertAggregatableCurrency`), and
 *  - at the aggregate, so a household that already holds such an account still
 *    gets a working dashboard with an honest note about what is missing
 *    (see `partitionByAggregationCurrency`).
 *
 * Only the second half existed before, and it threw, which turned one account
 * into a permanently broken household (FPA-001).
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

/** Raised when an account would be created or moved into a currency V1 cannot aggregate. */
export class UnsupportedCurrencyException extends HttpException {
  constructor(accountCurrency: string, baseCurrency: string) {
    // Flat shape, because ValidationExceptionFilter reads code/message/fields
    // off the response body and wraps them in the client envelope itself.
    super(
      {
        code: "UNSUPPORTED_ACCOUNT_CURRENCY",
        message:
          `Kontot använder ${accountCurrency}, men hushållet räknar sina summor i ` +
          `${baseCurrency}. Växelkursberäkning finns inte ännu, så konton måste ` +
          `använda hushållets valuta.`,
        fields: { currency: `Måste vara ${baseCurrency}` },
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/** Refuse an account currency the household's totals cannot include. */
export function assertAggregatableCurrency(
  accountCurrency: string,
  baseCurrency: string,
): void {
  if (accountCurrency !== baseCurrency) {
    throw new UnsupportedCurrencyException(accountCurrency, baseCurrency);
  }
}

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
