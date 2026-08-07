import { z } from "zod";
import { moneySchema } from "./money";

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
});

export const accountsResponseSchema = z.object({
  items: z.array(accountSchema),
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
