import { z } from "zod";
import { moneySchema } from "./money";

export const reviewItemSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "unknown_transaction",
    "possible_internal_transfer",
    "unknown_merchant",
    "document_field",
  ]),
  title: z.string(),
  detail: z.string(),
  amount: moneySchema.nullable(),
  bookingDate: z.string().nullable(),
  entityId: z.string().nullable(),
});

export const reviewResponseSchema = z.object({
  total: z.number(),
  items: z.array(reviewItemSchema),
  counts: z.object({
    unknownTransactions: z.number(),
    possibleInternalTransfers: z.number(),
    unknownMerchants: z.number(),
    documentFields: z.number(),
  }),
});

export type ReviewResponse = z.infer<typeof reviewResponseSchema>;

export const resolveReviewSchema = z
  .object({
    householdId: z.string().uuid(),
    itemId: z.string().min(1).max(200),
    kind: z.enum([
      "unknown_transaction",
      "possible_internal_transfer",
      "unknown_merchant",
      "document_field",
    ]),
    entityId: z.string().uuid(),
    action: z.enum([
      "set_category",
      "mark_internal_transfer",
      "set_merchant",
      "archive_document",
      "dismiss",
    ]),
    categoryId: z.string().uuid().optional(),
    merchantId: z.string().uuid().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .strict();
export type ResolveReviewInput = z.input<typeof resolveReviewSchema>;

