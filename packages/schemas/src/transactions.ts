import { z } from "zod";
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
    })
    .optional(),
});

export const updateTransactionSchema = z.object({
  householdId: z.string().uuid(),
  categoryId: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  isExcluded: z.boolean().optional(),
  description: z.string().max(500).nullable().optional(),
});

export const categorySchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  name: z.string(),
  kind: z.string(),
  parentId: z.string().uuid().nullable().optional(),
});

export const categoriesResponseSchema = z.object({
  items: z.array(categorySchema),
});

export type TransactionDto = z.infer<typeof transactionSchema>;
export type TransactionDetailDto = z.infer<typeof transactionDetailSchema>;
export type TransactionsResponse = z.infer<typeof transactionsResponseSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type CategoriesResponse = z.infer<typeof categoriesResponseSchema>;
