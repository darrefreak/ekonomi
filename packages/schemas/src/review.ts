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
