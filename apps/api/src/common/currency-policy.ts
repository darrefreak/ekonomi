import { HttpException, HttpStatus } from "@nestjs/common";
import { AGGREGATION_CURRENCIES } from "@ffos/schemas";

/**
 * V1 has one financial currency per household and no FX engine.
 *
 * The decision, recorded in `docs/CURRENCY_POLICY.md`: the only
 * currency V1 can aggregate is SEK. Everything downstream — account creation,
 * ledger persistence, every total — is measured against the household's base
 * currency, and that base currency must be one V1 actually supports.
 *
 * The previous pass expressed the same idea as "the account form should not
 * offer EUR". That is a statement about one form, and the product went on
 * offering EUR one screen earlier while refusing it everywhere else. This
 * module is the rule itself, so every boundary asks the same question.
 */

export const V1_AGGREGATION_CURRENCIES = AGGREGATION_CURRENCIES;

export type AggregationCurrency = (typeof V1_AGGREGATION_CURRENCIES)[number];

export function isSupportedAggregationCurrency(
  code: string | null | undefined,
): code is AggregationCurrency {
  return (
    !!code && (V1_AGGREGATION_CURRENCIES as readonly string[]).includes(code)
  );
}

const SUPPORTED_LIST = V1_AGGREGATION_CURRENCIES.join(", ");

/**
 * All three exceptions use a flat body: `ValidationExceptionFilter` reads
 * `code` / `message` / `fields` off the response and wraps them in the client
 * envelope itself.
 */

/** A household whose base currency V1 cannot aggregate at all. */
export class UnsupportedHouseholdCurrencyException extends HttpException {
  constructor(baseCurrency: string) {
    super(
      {
        code: "UNSUPPORTED_HOUSEHOLD_CURRENCY",
        message:
          `Hushållet räknar sina summor i ${baseCurrency}, men den här versionen ` +
          `stödjer bara ${SUPPORTED_LIST}. Växelkursberäkning finns inte ännu.`,
        fields: { baseCurrency: `Måste vara ${SUPPORTED_LIST}` },
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/** An account currency the household's totals cannot include. */
export class UnsupportedCurrencyException extends HttpException {
  constructor(accountCurrency: string, baseCurrency: string) {
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

/**
 * A write aimed at an account the totals already refuse to include.
 *
 * Such an account is readable and archivable but takes no money, because money
 * booked there lands outside every total: the income statement would move and
 * the balance sheet would not (FPR-002).
 */
export class CurrencyQuarantineException extends HttpException {
  constructor(
    readonly detail: {
      accountId: string;
      accountName?: string | null;
      accountCurrency: string;
      baseCurrency: string;
    },
  ) {
    super(
      {
        code: "ACCOUNT_CURRENCY_QUARANTINED",
        message:
          `Kontot ${detail.accountName ?? detail.accountId} använder ` +
          `${detail.accountCurrency} medan hushållet räknar i ${detail.baseCurrency}. ` +
          `Det går inte att bokföra pengar på kontot förrän det är åtgärdat — ` +
          `arkivera kontot eller kontakta support.`,
        fields: { accountId: "Kontot är spärrat för bokföring" },
      },
      HttpStatus.CONFLICT,
    );
  }
}

/** Refuse a household base currency V1 cannot aggregate. */
export function assertSupportedHouseholdCurrency(
  baseCurrency: string | null | undefined,
): asserts baseCurrency is AggregationCurrency {
  if (!isSupportedAggregationCurrency(baseCurrency)) {
    throw new UnsupportedHouseholdCurrencyException(baseCurrency ?? "okänd");
  }
}

/** Refuse an account currency the household's totals cannot include. */
export function assertAggregatableCurrency(
  accountCurrency: string,
  baseCurrency: string,
): void {
  assertSupportedHouseholdCurrency(baseCurrency);
  if (accountCurrency !== baseCurrency) {
    throw new UnsupportedCurrencyException(accountCurrency, baseCurrency);
  }
}
