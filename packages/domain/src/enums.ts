export const HouseholdRole = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  ADULT: "ADULT",
  VIEWER: "VIEWER",
  CHILD: "CHILD",
} as const;
export type HouseholdRole = (typeof HouseholdRole)[keyof typeof HouseholdRole];

export const AccessPolicy = {
  FULL_DETAILS: "FULL_DETAILS",
  AGGREGATES_ONLY: "AGGREGATES_ONLY",
  BALANCE_ONLY: "BALANCE_ONLY",
  OWNER_ONLY: "OWNER_ONLY",
  CUSTOM: "CUSTOM",
} as const;
export type AccessPolicy = (typeof AccessPolicy)[keyof typeof AccessPolicy];

export const AccountType = {
  CHECKING: "CHECKING",
  SAVINGS: "SAVINGS",
  CREDIT_CARD: "CREDIT_CARD",
  CASH: "CASH",
  INVESTMENT: "INVESTMENT",
  MORTGAGE: "MORTGAGE",
  LOAN: "LOAN",
  TAX_ACCOUNT: "TAX_ACCOUNT",
  PENSION: "PENSION",
  CRYPTO: "CRYPTO",
  OTHER: "OTHER",
} as const;
export type AccountType = (typeof AccountType)[keyof typeof AccountType];

export const FinancialEventType = {
  INCOME: "INCOME",
  EXPENSE: "EXPENSE",
  TRANSFER: "TRANSFER",
  INVESTMENT: "INVESTMENT",
  LOAN_PRINCIPAL: "LOAN_PRINCIPAL",
  INTEREST: "INTEREST",
  FEE: "FEE",
  TAX: "TAX",
  REFUND: "REFUND",
  REIMBURSEMENT: "REIMBURSEMENT",
  ASSET_PURCHASE: "ASSET_PURCHASE",
  ASSET_SALE: "ASSET_SALE",
  CREDIT_CARD_PURCHASE: "CREDIT_CARD_PURCHASE",
  CREDIT_CARD_PAYMENT: "CREDIT_CARD_PAYMENT",
  ADJUSTMENT: "ADJUSTMENT",
  UNKNOWN: "UNKNOWN",
} as const;
export type FinancialEventType =
  (typeof FinancialEventType)[keyof typeof FinancialEventType];

export const ConnectionStatus = {
  CONNECTED: "CONNECTED",
  SYNCING: "SYNCING",
  AUTH_REQUIRED: "AUTH_REQUIRED",
  DEGRADED: "DEGRADED",
  ERROR: "ERROR",
  DISCONNECTED: "DISCONNECTED",
} as const;
export type ConnectionStatus =
  (typeof ConnectionStatus)[keyof typeof ConnectionStatus];

export const DataSourceDomain = {
  BANKING: "BANKING",
  INVESTMENTS: "INVESTMENTS",
  TAX: "TAX",
  GOVERNMENT: "GOVERNMENT",
  INSURANCE: "INSURANCE",
  UTILITIES: "UTILITIES",
  VEHICLE: "VEHICLE",
  DOCUMENTS: "DOCUMENTS",
  OTHER: "OTHER",
} as const;
export type DataSourceDomain =
  (typeof DataSourceDomain)[keyof typeof DataSourceDomain];

export const RiskLevel = {
  LOW: "LOW",
  MODERATE: "MODERATE",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
} as const;
export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];
