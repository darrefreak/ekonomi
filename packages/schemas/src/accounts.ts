import { z } from "zod";
import { amountMinorStringSchema, currencyCodeSchema, nonNegativeAmountMinorStringSchema } from "./common";
import { moneySchema } from "./money";

export const accountTypeSchema = z.enum([
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
  "OTHER",
  "ASSET",
]);

export const accountSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  provider: z.string().nullable(),
  accountType: z.string(),
  currency: z.string(),
  isShared: z.boolean(),
  currentBalance: moneySchema,
  connectionStatus: z.string(),
  lastSyncedAt: z.string().nullable(),
  freshnessLabel: z.string().nullable().optional(),
  archivedAt: z.string().nullable().optional(),
  privacyRedacted: z.boolean().optional(),
  privacyLevel: z.enum(["full", "balance", "aggregate", "hidden"]).optional(),
});

export const accountsResponseSchema = z.object({
  items: z.array(accountSchema),
});

export const createAccountSchema = z
  .object({
    householdId: z.string().uuid(),
    name: z.string().min(1).max(160),
    accountType: accountTypeSchema,
    currency: currencyCodeSchema.default("SEK"),
    provider: z.string().max(80).optional().nullable(),
    isShared: z.boolean().optional().default(true),
    creditLimitMinor: amountMinorStringSchema.optional().nullable(),
    externalReference: z.string().max(160).optional().nullable(),
    openingBalanceMinor: nonNegativeAmountMinorStringSchema.optional().default("0"),
  })
  .strict();

export const updateAccountSchema = z
  .object({
    householdId: z.string().uuid(),
    name: z.string().min(1).max(160).optional(),
    provider: z.string().max(80).optional().nullable(),
    isShared: z.boolean().optional(),
    creditLimitMinor: amountMinorStringSchema.optional().nullable(),
    externalReference: z.string().max(160).optional().nullable(),
    connectionStatus: z
      .enum([
        "CONNECTED",
        "SYNCING",
        "AUTH_REQUIRED",
        "DEGRADED",
        "ERROR",
        "DISCONNECTED",
      ])
      .optional(),
  })
  .strict();

export const reconcileStatusSchema = z.enum([
  "MATCHED",
  "MISMATCH",
  "MISSING_REPORTED_BALANCE",
  "MISSING_LEDGER_DATA",
  "REVIEW_REQUIRED",
]);

export const accountDetailSchema = accountSchema.extend({
  creditLimit: moneySchema.nullable().optional(),
  externalReference: z.string().nullable().optional(),
  /** Ledger-calculated balance (authoritative). */
  ledgerBalance: moneySchema.optional(),
  /** Provider/bank-reported balance for reconciliation. */
  reportedBalance: moneySchema.nullable().optional(),
  reconciliation: z
    .object({
      status: z.union([reconcileStatusSchema, z.string()]),
      difference: moneySchema.nullable(),
    })
    .nullable()
    .optional(),
  recentTransactions: z.array(
    z.object({
      id: z.string(),
      bookingDate: z.string(),
      description: z.string().nullable(),
      amount: moneySchema,
      merchantName: z.string().nullable(),
      categoryName: z.string().nullable(),
    }),
  ),
  balanceHistory: z.array(
    z.object({
      asOf: z.string(),
      balance: moneySchema,
      source: z.string(),
    }),
  ),
  period: z.object({
    income: moneySchema,
    expenses: moneySchema,
  }),
});

export const listAccountsQuerySchema = z.object({
  householdId: z.string().uuid(),
  includeArchived: z.enum(["true", "false", "1", "0"]).optional(),
});

export type AccountDto = z.infer<typeof accountSchema>;
export type AccountsResponse = z.infer<typeof accountsResponseSchema>;
export type AccountDetailDto = z.infer<typeof accountDetailSchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type ListAccountsQuery = z.infer<typeof listAccountsQuerySchema>;
