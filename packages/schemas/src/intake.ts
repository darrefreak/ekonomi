import { z } from "zod";
import { moneySchema } from "./money";

export const documentsResponseSchema = z.object({
  asOf: z.string(),
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      documentType: z.string(),
      status: z.string(),
      issuer: z.string().nullable(),
      amount: moneySchema.nullable(),
      sourceName: z.string().nullable(),
      receivedAt: z.string(),
      notes: z.string().nullable(),
    }),
  ),
});
export type DocumentsResponse = z.infer<typeof documentsResponseSchema>;

export const integrationsResponseSchema = z.object({
  asOf: z.string(),
  sources: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      providerId: z.string(),
      connectionStatus: z.string(),
      freshnessLabel: z.string().nullable(),
      lastSyncedAt: z.string().nullable(),
      domain: z.string(),
    }),
  ),
  recentSyncs: z.array(
    z.object({
      id: z.string(),
      status: z.string(),
      recordsFetched: z.number(),
      message: z.string().nullable(),
      startedAt: z.string(),
      completedAt: z.string().nullable(),
    }),
  ),
});
export type IntegrationsResponse = z.infer<typeof integrationsResponseSchema>;

export const importsResponseSchema = z.object({
  asOf: z.string(),
  batches: z.array(
    z.object({
      id: z.string(),
      status: z.string(),
      totalRecords: z.number(),
      createdCount: z.number(),
      startedAt: z.string(),
      completedAt: z.string().nullable(),
    }),
  ),
});
export type ImportsResponse = z.infer<typeof importsResponseSchema>;
