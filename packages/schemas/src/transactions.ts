import { z } from "zod";
import { moneySchema } from "./money";

export const transactionSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  accountName: z.string(),
  bookingDate: z.string(),
  description: z.string().nullable(),
  amount: moneySchema,
  categoryName: z.string().nullable(),
  merchantName: z.string().nullable(),
  isInternalTransfer: z.boolean(),
  status: z.string(),
});

export const transactionsResponseSchema = z.object({
  items: z.array(transactionSchema),
});

export type TransactionDto = z.infer<typeof transactionSchema>;
export type TransactionsResponse = z.infer<typeof transactionsResponseSchema>;
