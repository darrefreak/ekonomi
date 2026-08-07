import { z } from "zod";
import {
  amountMinorStringSchema,
  currencyCodeSchema,
  positiveAmountMinorStringSchema,
  uuidSchema,
} from "./common";

export const transactionSplitLineSchema = z
  .object({
    categoryId: uuidSchema.optional(),
    amountMinor: amountMinorStringSchema,
    memo: z.string().max(200).optional(),
  })
  .strict();

/**
 * Split total must equal the source economic amount (same currency).
 * Used for mortgage principal/interest and future multi-category splits.
 */
export const transactionSplitsSchema = z
  .object({
    currency: currencyCodeSchema.default("SEK"),
    sourceAmountMinor: positiveAmountMinorStringSchema,
    splits: z.array(transactionSplitLineSchema).min(1).max(20),
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

export type TransactionSplitsInput = z.infer<typeof transactionSplitsSchema>;
