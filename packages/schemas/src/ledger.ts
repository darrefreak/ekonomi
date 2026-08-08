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

export const createCashRefundSchema = z
  .object({
    householdId: uuidSchema,
    cashAccountId: uuidSchema,
    expenseAccountId: uuidSchema.optional(),
    amountMinor: positiveAmountMinorStringSchema,
    occurredOn: isoDateSchema,
    description: descriptionSchema,
    externalId: z.string().max(160).optional(),
  })
  .strict();

export const createAssetPurchaseSchema = z
  .object({
    householdId: uuidSchema,
    cashAccountId: uuidSchema,
    assetAccountId: uuidSchema,
    amountMinor: positiveAmountMinorStringSchema,
    occurredOn: isoDateSchema,
    description: descriptionSchema,
    vehicleId: uuidSchema.optional(),
    externalId: z.string().max(160).optional(),
  })
  .strict();

export const createFinancedAssetPurchaseSchema = z
  .object({
    householdId: uuidSchema,
    cashAccountId: uuidSchema,
    assetAccountId: uuidSchema,
    loanAccountId: uuidSchema,
    purchasePriceMinor: positiveAmountMinorStringSchema,
    downPaymentMinor: z.string().regex(/^\d+$/),
    occurredOn: isoDateSchema,
    description: descriptionSchema,
    vehicleId: uuidSchema.optional(),
    externalId: z.string().max(160).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    try {
      if (BigInt(value.downPaymentMinor) > BigInt(value.purchasePriceMinor)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Kontantinsats får inte överstiga köpeskilling",
          path: ["downPaymentMinor"],
        });
      }
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ogiltiga belopp",
        path: ["purchasePriceMinor"],
      });
    }
  });

export const replaceEventSplitsBodySchema = z
  .object({
    householdId: uuidSchema,
    sourceAmountMinor: positiveAmountMinorStringSchema,
    currency: z.literal("SEK").default("SEK"),
    splits: z
      .array(
        z
          .object({
            categoryId: uuidSchema.optional(),
            amountMinor: positiveAmountMinorStringSchema,
            memo: z.string().max(200).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict()
  .superRefine((value, ctx) => {
    const total = value.splits.reduce(
      (acc, line) => acc + BigInt(line.amountMinor),
      0n,
    );
    if (total !== BigInt(value.sourceAmountMinor)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Summan av delningar måste matcha beloppet",
        path: ["splits"],
      });
    }
  });

export const reviseClassificationSchema = z
  .object({
    householdId: uuidSchema,
    financialEventId: uuidSchema,
    mode: z.enum(["EXPENSE_TO_TRANSFER"]),
    fromAccountId: uuidSchema,
    toAccountId: uuidSchema,
    amountMinor: positiveAmountMinorStringSchema,
    occurredOn: isoDateSchema,
    description: descriptionSchema,
  })
  .strict()
  .refine((v) => v.fromAccountId !== v.toAccountId, {
    message: "fromAccountId and toAccountId must differ",
    path: ["toAccountId"],
  });

export const reverseFinancialEventSchema = z
  .object({
    householdId: uuidSchema,
    financialEventId: uuidSchema,
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
export type CreateCashRefundInput = z.infer<typeof createCashRefundSchema>;
export type CreateAssetPurchaseInput = z.infer<typeof createAssetPurchaseSchema>;
export type CreateFinancedAssetPurchaseInput = z.infer<
  typeof createFinancedAssetPurchaseSchema
>;
export type ReplaceEventSplitsBody = z.infer<typeof replaceEventSplitsBodySchema>;
export type ReviseClassificationInput = z.infer<typeof reviseClassificationSchema>;
export type ReverseFinancialEventInput = z.infer<
  typeof reverseFinancialEventSchema
>;
