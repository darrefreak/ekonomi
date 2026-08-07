import { z } from "zod";
import {
  isoDateSchema,
  positiveAmountMinorStringSchema,
  uuidSchema,
} from "./common";

const descriptionSchema = z.string().max(240).optional();

export const ledgerReconcileBodySchema = z
  .object({
    householdId: uuidSchema,
    asOf: isoDateSchema.optional(),
  })
  .strict();

export const createInternalTransferSchema = z
  .object({
    householdId: uuidSchema,
    fromAccountId: uuidSchema,
    toAccountId: uuidSchema,
    amountMinor: positiveAmountMinorStringSchema,
    occurredOn: isoDateSchema,
    description: descriptionSchema,
    externalId: z.string().max(160).optional(),
  })
  .strict()
  .refine((v) => v.fromAccountId !== v.toAccountId, {
    message: "fromAccountId and toAccountId must differ",
    path: ["toAccountId"],
  });

export const createCreditCardPurchaseSchema = z
  .object({
    householdId: uuidSchema,
    creditCardAccountId: uuidSchema,
    expenseAccountId: uuidSchema,
    amountMinor: positiveAmountMinorStringSchema,
    occurredOn: isoDateSchema,
    description: descriptionSchema,
    categoryId: uuidSchema.optional(),
  })
  .strict();

export const createCreditCardPaymentSchema = z
  .object({
    householdId: uuidSchema,
    cashAccountId: uuidSchema,
    creditCardAccountId: uuidSchema,
    amountMinor: positiveAmountMinorStringSchema,
    occurredOn: isoDateSchema,
    description: descriptionSchema,
  })
  .strict();

export const createMortgagePaymentSchema = z
  .object({
    householdId: uuidSchema,
    cashAccountId: uuidSchema,
    mortgageAccountId: uuidSchema,
    interestExpenseAccountId: uuidSchema,
    principalMinor: positiveAmountMinorStringSchema,
    interestMinor: positiveAmountMinorStringSchema,
    occurredOn: isoDateSchema,
    description: descriptionSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    // Split coherence: principal + interest is the cash outflow.
    try {
      const total =
        BigInt(value.principalMinor) + BigInt(value.interestMinor);
      if (total <= 0n) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Principal + interest must be positive",
          path: ["interestMinor"],
        });
      }
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid principal/interest amounts",
        path: ["principalMinor"],
      });
    }
  });

export const createInvestmentTransferSchema = z
  .object({
    householdId: uuidSchema,
    cashAccountId: uuidSchema,
    investmentAccountId: uuidSchema,
    amountMinor: positiveAmountMinorStringSchema,
    occurredOn: isoDateSchema,
    description: descriptionSchema,
  })
  .strict();

export const createAssetDepreciationSchema = z
  .object({
    householdId: uuidSchema,
    assetAccountId: uuidSchema,
    expenseAccountId: uuidSchema,
    amountMinor: positiveAmountMinorStringSchema,
    occurredOn: isoDateSchema,
    description: descriptionSchema,
    vehicleId: uuidSchema.optional(),
  })
  .strict();

export const ledgerBalancesQuerySchema = z.object({
  householdId: uuidSchema,
  asOf: isoDateSchema.optional(),
});

export type CreateInternalTransferInput = z.infer<
  typeof createInternalTransferSchema
>;
export type CreateAssetDepreciationInput = z.infer<
  typeof createAssetDepreciationSchema
>;
