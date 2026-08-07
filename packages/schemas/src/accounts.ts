import { z } from "zod";
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
});

export const accountsResponseSchema = z.object({
  items: z.array(accountSchema),
});

export const createAccountSchema = z.object({
  householdId: z.string().uuid(),
  name: z.string().min(1).max(160),
  accountType: accountTypeSchema,
  currency: z.string().length(3).default("SEK"),
  provider: z.string().max(80).optional().nullable(),
  isShared: z.boolean().optional().default(true),
  creditLimitMinor: z.string().regex(/^-?\d+$/).optional().nullable(),
  externalReference: z.string().max(160).optional().nullable(),
  openingBalanceMinor: z.string().regex(/^-?\d+$/).optional().default("0"),
});

export const updateAccountSchema = z.object({
  householdId: z.string().uuid(),
  name: z.string().min(1).max(160).optional(),
  provider: z.string().max(80).optional().nullable(),
  isShared: z.boolean().optional(),
  creditLimitMinor: z.string().regex(/^-?\d+$/).optional().nullable(),
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
});

export const accountDetailSchema = accountSchema.extend({
  creditLimit: moneySchema.nullable().optional(),
  externalReference: z.string().nullable().optional(),
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

export type AccountDto = z.infer<typeof accountSchema>;
export type AccountsResponse = z.infer<typeof accountsResponseSchema>;
export type AccountDetailDto = z.infer<typeof accountDetailSchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
