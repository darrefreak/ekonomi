export const ACCOUNT_TYPES = [
  "CHECKING",
  "SAVINGS",
  "CREDIT_CARD",
  "CASH",
  "INVESTMENT",
  "MORTGAGE",
  "LOAN",
  "TAX_ACCOUNT",
  "PENSION",
  "CRYPTO",
  "ASSET",
  "OTHER",
] as const;

export const ACCOUNT_TYPE_LABELS: Record<(typeof ACCOUNT_TYPES)[number], string> = {
  CHECKING: "Transaktionskonto",
  SAVINGS: "Sparkonto",
  CREDIT_CARD: "Kreditkort",
  CASH: "Kontanter",
  INVESTMENT: "Investeringskonto",
  MORTGAGE: "Bolån",
  LOAN: "Lån",
  TAX_ACCOUNT: "Skattekonto",
  PENSION: "Pension",
  CRYPTO: "Krypto",
  ASSET: "Tillgång",
  OTHER: "Övrigt",
};

export function accountTypeLabel(accountType: string): string {
  return (
    ACCOUNT_TYPE_LABELS[accountType as (typeof ACCOUNT_TYPES)[number]] ?? accountType
  );
}

export const CURRENCIES = ["SEK", "EUR", "USD", "NOK", "DKK"] as const;

export const PRIVACY_POLICY_LABELS: Record<string, string> = {
  FULL_DETAILS: "Fullständiga detaljer",
  BALANCE_ONLY: "Endast saldo",
  AGGREGATES_ONLY: "Endast hushållstotaler",
  OWNER_ONLY: "Privat",
  CUSTOM: "Anpassad",
};

export const MEMBER_ROLE_LABELS: Record<string, string> = {
  OWNER: "Ägare",
  ADMIN: "Administratör",
  ADULT: "Vuxen",
  VIEWER: "Läsare",
  CHILD: "Barn",
};
