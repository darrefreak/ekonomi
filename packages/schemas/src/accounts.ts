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

export type AccountDto = z.infer<typeof accountSchema>;
export type AccountsResponse = z.infer<typeof accountsResponseSchema>;
