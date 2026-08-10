import { z } from "zod";
import { uuidSchema } from "./common";

export const merchantSchema = z.object({
  id: z.string().uuid(),
  canonicalName: z.string(),
  aliases: z.array(z.string()).optional().default([]),
  merchantCategory: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  userVerified: z.boolean().optional(),
});

export const merchantsResponseSchema = z.object({
  items: z.array(merchantSchema),
});

export const listMerchantsQuerySchema = z.object({
  householdId: uuidSchema,
  q: z.string().max(200).optional(),
});

export const merchantNormalizeQuerySchema = z.object({
  householdId: uuidSchema,
  raw: z.string().min(1).max(500),
});

export const merchantMatchSchema = z.object({
  merchantId: z.string().uuid(),
  canonicalName: z.string(),
  confidence: z.number(),
  stage: z.string(),
});

export const merchantNormalizeResponseSchema = z.object({
  rawDescription: z.string(),
  normalizedText: z.string(),
  tokens: z.array(z.string()),
  match: merchantMatchSchema.nullable(),
  needsReview: z.boolean(),
  stagesApplied: z.array(z.string()),
});

export const verifyMerchantAliasSchema = z.object({
  householdId: uuidSchema,
  merchantId: uuidSchema,
  rawDescription: z.string().min(1).max(500),
});

export const verifyMerchantAliasResponseSchema = z.object({
  merchantId: z.string().uuid(),
  canonicalName: z.string(),
  aliasAdded: z.string(),
  userVerified: z.literal(true),
});

export type MerchantDto = z.infer<typeof merchantSchema>;
export type MerchantsResponse = z.infer<typeof merchantsResponseSchema>;
export type MerchantNormalizeResponse = z.infer<
  typeof merchantNormalizeResponseSchema
>;
export type VerifyMerchantAliasInput = z.infer<typeof verifyMerchantAliasSchema>;
