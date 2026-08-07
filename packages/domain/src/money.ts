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

/**
 * Parse a major-unit kronor string (e.g. "1234,50" / "1234.5") into minor units.
 * Uses integer/bigint arithmetic only — never JS float.
 */
export function kronorStringToMinor(value: string): bigint | null {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const match = /^(-?)(\d+)(?:\.(\d{0,2}))?$/.exec(normalized);
  if (!match) return null;
  const sign = match[1] === "-" ? -1n : 1n;
  const whole = BigInt(match[2]!);
  const fracRaw = match[3] ?? "";
  // Reject trailing junk like "1.2.3" already handled by regex; pad fractional öre.
  if (fracRaw.length > 2) return null;
  const frac = BigInt(fracRaw.padEnd(2, "0") || "0");
  return sign * (whole * 100n + frac);
}

/** Serialize minor units for editable major-unit inputs (no float). */
export function minorToKronorString(amountMinor: bigint | string): string {
  let n: bigint;
  try {
    n = typeof amountMinor === "bigint" ? amountMinor : BigInt(amountMinor);
  } catch {
    return "0";
  }
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const whole = abs / 100n;
  const frac = abs % 100n;
  const body =
    frac === 0n
      ? whole.toString()
      : `${whole.toString()}.${frac.toString().padStart(2, "0")}`;
  return neg ? `-${body}` : body;
}
