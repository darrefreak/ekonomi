import { z } from "zod";
import { currencyCodeSchema, nonNegativeAmountMinorStringSchema } from "./common";

const minorString = nonNegativeAmountMinorStringSchema;

export const settingsResponseSchema = z.object({
  householdId: z.string().uuid(),
  householdName: z.string(),
  locale: z.string(),
  appearance: z.enum(["system", "light", "dark"]),
  financialPolicies: z.object({
    minimumCashBalanceMinor: minorString,
    emergencyFundTargetMinor: minorString,
    safetyMarginMinor: minorString,
    currency: z.string(),
  }),
  members: z
    .array(
      z.object({
        id: z.string().uuid(),
        userId: z.string().uuid(),
        displayName: z.string(),
        role: z.string(),
        personalDataPolicy: z.string(),
      }),
    )
    .optional()
    .default([]),
});
export type SettingsResponse = z.infer<typeof settingsResponseSchema>;

export const updateSettingsSchema = z
  .object({
    householdId: z.string().uuid(),
    locale: z.enum(["sv-SE", "en-US"]).optional(),
    appearance: z.enum(["system", "light", "dark"]).optional(),
    householdName: z.string().min(1).max(120).optional(),
    financialPolicies: z
      .object({
        minimumCashBalanceMinor: minorString.optional(),
        emergencyFundTargetMinor: minorString.optional(),
        safetyMarginMinor: minorString.optional(),
        currency: currencyCodeSchema.optional(),
      })
      .strict()
      .optional(),
    memberPolicy: z
      .object({
        memberId: z.string().uuid(),
        personalDataPolicy: z.enum([
          "FULL_DETAILS",
          "AGGREGATES_ONLY",
          "BALANCE_ONLY",
          "OWNER_ONLY",
          "CUSTOM",
        ]),
      })
      .strict()
      .optional(),
  })
  .strict();
export type UpdateSettingsInput = z.input<typeof updateSettingsSchema>;
