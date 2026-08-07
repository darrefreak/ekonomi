import { z } from "zod";
import { moneySchema } from "./money";

export const documentStatusSchema = z.enum([
  "NEW",
  "PROCESSING",
  "REVIEW",
  "ACTION_REQUIRED",
  "ARCHIVED",
]);

export const documentTypeSchema = z.enum([
  "INVOICE",
  "INSURANCE",
  "TAX",
  "LOAN_STATEMENT",
  "ANNUAL_STATEMENT",
  "SALARY",
  "CONTRACT",
  "RECEIPT",
  "VEHICLE",
  "OTHER",
]);

export const documentSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  documentType: z.string(),
  status: z.string(),
  issuer: z.string().nullable(),
  amount: moneySchema.nullable(),
  sourceName: z.string().nullable(),
  receivedAt: z.string(),
  notes: z.string().nullable(),
  extracted: z.record(z.unknown()).optional().default({}),
  storageKey: z.string().nullable().optional(),
  contentType: z.string().nullable().optional(),
  byteSize: z.number().nullable().optional(),
  originalFilename: z.string().nullable().optional(),
  vehicleId: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
  downloadUrl: z.string().nullable().optional(),
});
export type DocumentDto = z.infer<typeof documentSchema>;

export const documentsResponseSchema = z.object({
  asOf: z.string(),
  items: z.array(documentSchema),
});
export type DocumentsResponse = z.infer<typeof documentsResponseSchema>;

export const documentDetailSchema = documentSchema.extend({
  checksumSha256: z.string().nullable().optional(),
  bucket: z.string().nullable().optional(),
  storageDriver: z.string().nullable().optional(),
});
export type DocumentDetailDto = z.infer<typeof documentDetailSchema>;

export const uploadDocumentSchema = z.object({
  householdId: z.string().uuid(),
  title: z.string().min(1).max(200),
  documentType: documentTypeSchema.optional().default("OTHER"),
  filename: z.string().min(1).max(260),
  contentType: z.string().min(1).max(120).optional().default("application/octet-stream"),
  /** Base64 file payload (V1; multipart can replace later). */
  contentBase64: z.string().min(1),
  vehicleId: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type UploadDocumentInput = z.input<typeof uploadDocumentSchema>;

export const updateDocumentSchema = z.object({
  householdId: z.string().uuid(),
  status: documentStatusSchema.optional(),
  documentType: documentTypeSchema.optional(),
  notes: z.string().max(2000).nullable().optional(),
  vehicleId: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(200).optional(),
});
export type UpdateDocumentInput = z.input<typeof updateDocumentSchema>;

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
