import { z } from "zod";

export const moneySchema = z.object({
  amountMinor: z.string().regex(/^-?\d+$/),
  currency: z.enum(["SEK", "EUR", "USD", "NOK", "DKK"]),
});

export type MoneyDto = z.infer<typeof moneySchema>;
