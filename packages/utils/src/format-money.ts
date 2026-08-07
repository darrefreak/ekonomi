import type { Money } from "@ffos/domain";

export type LocaleCode = "sv-SE" | "en-US";

const currencyDisplay: Record<string, { sv: string; en: string }> = {
  SEK: { sv: "kr", en: "SEK" },
  EUR: { sv: "€", en: "EUR" },
  USD: { sv: "$", en: "USD" },
  NOK: { sv: "kr", en: "NOK" },
  DKK: { sv: "kr", en: "DKK" },
};

/**
 * Format money for UI. Uses Intl for grouping; amounts are derived from minor units.
 */
export function formatMoney(
  value: Money,
  locale: LocaleCode = "sv-SE",
  options?: { signed?: boolean },
): string {
  const major = Number(value.amountMinor) / 100;
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    signDisplay: options?.signed ? "exceptZero" : "auto",
  }).format(major);

  const suffix =
    locale === "sv-SE"
      ? (currencyDisplay[value.currency]?.sv ?? value.currency)
      : (currencyDisplay[value.currency]?.en ?? value.currency);

  return `${formatted} ${suffix}`;
}

export function formatCompactMoney(value: Money, locale: LocaleCode = "sv-SE"): string {
  const major = Number(value.amountMinor) / 100;
  if (Math.abs(major) >= 1_000_000) {
    const m = major / 1_000_000;
    const n = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 2,
    }).format(m);
    return locale === "sv-SE" ? `${n} mkr` : `${n}M ${value.currency}`;
  }
  if (Math.abs(major) >= 1_000) {
    const k = major / 1_000;
    const n = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 0,
    }).format(k);
    return locale === "sv-SE" ? `${n}k kr` : `${n}k ${value.currency}`;
  }
  return formatMoney(value, locale);
}
