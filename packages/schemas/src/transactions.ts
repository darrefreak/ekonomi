import { z } from "zod";
import { isoDateSchema, uuidSchema } from "./common";
import { moneySchema } from "./money";

export const transactionSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  accountName: z.string(),
  bookingDate: z.string(),
  description: z.string().nullable(),
  amount: moneySchema,
  categoryId: z.string().uuid().nullable().optional(),
  categoryName: z.string().nullable(),
  merchantId: z.string().uuid().nullable().optional(),
  merchantName: z.string().nullable(),
  isInternalTransfer: z.boolean(),
  transferGroupId: z.string().uuid().nullable().optional(),
  isExcluded: z.boolean().optional().default(false),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional().default([]),
  status: z.string(),
  vehicleId: z.string().uuid().nullable().optional(),
  financialEventId: z.string().uuid().nullable().optional(),
  privacyRedacted: z.boolean().optional(),
  privacyLevel: z.enum(["full", "balance", "aggregate", "hidden"]).optional(),
});

export const relatedTransactionSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  accountName: z.string(),
  bookingDate: z.string(),
  description: z.string().nullable(),
  amount: moneySchema,
  role: z.string().optional(),
});

export const transactionDetailSchema = transactionSchema.extend({
  relatedTransfers: z.array(relatedTransactionSchema).default([]),
});

export const transactionsResponseSchema = z.object({
  items: z.array(transactionSchema),
  filters: z
    .object({
      q: z.string().nullable().optional(),
      accountId: z.string().nullable().optional(),
      from: z.string().nullable().optional(),
      to: z.string().nullable().optional(),
      includeExcluded: z.boolean().optional(),
      categoryId: z.string().nullable().optional(),
      merchantId: z.string().nullable().optional(),
      merchantMissing: z.boolean().optional(),
    })
    .optional(),
});

export const updateTransactionSchema = z
  .object({
    householdId: z.string().uuid(),
    categoryId: z.string().uuid().nullable().optional(),
    merchantId: z.string().uuid().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    tags: z.array(z.string().max(40)).max(20).optional(),
    isExcluded: z.boolean().optional(),
    isInternalTransfer: z.boolean().optional(),
    description: z.string().max(500).nullable().optional(),
    vehicleId: z.string().uuid().nullable().optional(),
  })
  .strict();

/** Query for GET /transactions — bounds untrusted filters. */
export const listTransactionsQuerySchema = z
  .object({
    householdId: uuidSchema,
    limit: z
      .string()
      .regex(/^\d+$/, "limit måste vara ett positivt heltal")
      .optional()
      .refine(
        (v) => v == null || (Number(v) >= 1 && Number(v) <= 200),
        "limit måste vara 1–200",
      ),
    q: z.string().max(200).optional(),
    accountId: uuidSchema.optional(),
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    includeExcluded: z.enum(["true", "false", "1", "0"]).optional(),
    vehicleId: uuidSchema.optional(),
    categoryId: uuidSchema.optional(),
    merchantId: uuidSchema.optional(),
    merchantMissing: z.enum(["true", "false", "1", "0"]).optional(),
    direction: z.enum(["inflow", "outflow"]).optional(),
    /** Absolute amount bounds in minor units. */
    minAmountMinor: z.string().regex(/^\d+$/).optional(),
    maxAmountMinor: z.string().regex(/^\d+$/).optional(),
    sort: z
      .enum(["date_desc", "date_asc", "amount_desc", "amount_asc"])
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.from && value.to && value.from > value.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "from får inte vara efter to",
        path: ["to"],
      });
    }
  });


export type TransactionDto = z.infer<typeof transactionSchema>;
export type TransactionDetailDto = z.infer<typeof transactionDetailSchema>;
export type TransactionsResponse = z.infer<typeof transactionsResponseSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
