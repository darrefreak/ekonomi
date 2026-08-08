import { z } from "zod";
import { uuidSchema } from "./common";

export const merchantSchema = z.object({
  id: z.string().uuid(),
  canonicalName: z.string(),
  aliases: z.array(z.string()).optional().default([]),
  merchantCategory: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
});

export const merchantsResponseSchema = z.object({
  items: z.array(merchantSchema),
});

export const listMerchantsQuerySchema = z.object({
  householdId: uuidSchema,
  q: z.string().max(200).optional(),
});

export type MerchantDto = z.infer<typeof merchantSchema>;
export type MerchantsResponse = z.infer<typeof merchantsResponseSchema>;
