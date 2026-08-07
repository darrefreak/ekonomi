import { z } from "zod";
import { amountMinorStringSchema, currencyCodeSchema } from "./common";

export const moneySchema = z.object({
  amountMinor: amountMinorStringSchema,
  currency: currencyCodeSchema,
});

export type MoneyDto = z.infer<typeof moneySchema>;
