import { z } from "zod";
import { aggregationCurrencySchema } from "./common";

export const createHouseholdSchema = z
  .object({
    name: z.string().min(1).max(120),
    // Only a currency V1 can total. Offering EUR here and refusing it at every
    // account was how a participant ended up owning a household that could
    // never hold an account (FPR-001).
    baseCurrency: aggregationCurrencySchema.default("SEK"),
  })
  .strict();

/**
 * Move a household created before the guard onto a supported currency. Only
 * safe while the household holds no money: relabelling 100 EUR as 100 SEK
 * would be an invented exchange rate.
 */
export const migrateBaseCurrencySchema = z
  .object({
    baseCurrency: aggregationCurrencySchema,
  })
  .strict();

export const householdRoleSchema = z.enum([
  "OWNER",
  "ADMIN",
  "ADULT",
  "VIEWER",
  "CHILD",
]);

export type CreateHouseholdInput = z.infer<typeof createHouseholdSchema>;
export type MigrateBaseCurrencyInput = z.infer<typeof migrateBaseCurrencySchema>;
