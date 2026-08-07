import { z } from "zod";
import { moneySchema } from "./money";

export const netWorthResponseSchema = z.object({
  asOf: z.string(),
  current: moneySchema,
  breakdown: z.object({
    cash: moneySchema,
    investments: moneySchema,
    assets: moneySchema,
    liabilities: moneySchema,
  }),
  changeMonth: moneySchema,
  history: z.array(
    z.object({
      asOf: z.string(),
      netWorth: moneySchema,
      source: z.string().optional(),
    }),
  ),
  attribution: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      amount: moneySchema,
    }),
  ),
});

export type NetWorthResponse = z.infer<typeof netWorthResponseSchema>;
