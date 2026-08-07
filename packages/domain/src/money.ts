export type CurrencyCode = "SEK" | "EUR" | "USD" | "NOK" | "DKK";

/**
 * Monetary amount in minor units (e.g. öre for SEK).
 * Never use JavaScript number/float for money arithmetic.
 */
export type Money = {
  amountMinor: bigint;
  currency: CurrencyCode;
};

export type MoneyJson = {
  amountMinor: string;
  currency: CurrencyCode;
};

export function money(amountMinor: bigint | string | number, currency: CurrencyCode): Money {
  return {
    amountMinor: typeof amountMinor === "bigint" ? amountMinor : BigInt(amountMinor),
    currency,
  };
}

export function moneyToJson(value: Money): MoneyJson {
  return {
    amountMinor: value.amountMinor.toString(),
    currency: value.currency,
  };
}

export function moneyFromJson(value: MoneyJson): Money {
  return {
    amountMinor: BigInt(value.amountMinor),
    currency: value.currency,
  };
}

export function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export function subMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor - b.amountMinor, currency: a.currency };
}

export function negateMoney(value: Money): Money {
  return { amountMinor: -value.amountMinor, currency: value.currency };
}

export function isZeroMoney(value: Money): boolean {
  return value.amountMinor === 0n;
}
