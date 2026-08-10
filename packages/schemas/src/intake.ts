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

export const uploadDocumentSchema = z
  .object({
    householdId: z.string().uuid(),
    title: z.string().min(1).max(200),
    documentType: documentTypeSchema.optional().default("OTHER"),
    filename: z.string().min(1).max(260),
    contentType: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .default("application/octet-stream"),
    /** Base64 file payload (V1; multipart can replace later). */
    contentBase64: z.string().min(1).max(10_000_000),
    vehicleId: z.string().uuid().nullable().optional(),
    accountId: z.string().uuid().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .strict();
export type UploadDocumentInput = z.input<typeof uploadDocumentSchema>;

export const updateDocumentSchema = z
  .object({
    householdId: z.string().uuid(),
    status: documentStatusSchema.optional(),
    documentType: documentTypeSchema.optional(),
    notes: z.string().max(2000).nullable().optional(),
    vehicleId: z.string().uuid().nullable().optional(),
    accountId: z.string().uuid().nullable().optional(),
    title: z.string().min(1).max(200).optional(),
  })
  .strict();
export type UpdateDocumentInput = z.input<typeof updateDocumentSchema>;

export const connectionStatusSchema = z.enum([
  "CONNECTED",
  "SYNCING",
  "AUTH_REQUIRED",
  "DEGRADED",
  "ERROR",
  "DISCONNECTED",
]);

export const dataSourceDomainSchema = z.enum([
  "BANKING",
  "INVESTMENTS",
  "TAX",
  "GOVERNMENT",
  "INSURANCE",
  "UTILITIES",
  "VEHICLE",
  "DOCUMENTS",
  "OTHER",
]);

export const sourceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  providerId: z.string(),
  connectionStatus: z.string(),
  freshnessLabel: z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
  domain: z.string(),
  protocol: z.string().optional(),
  authenticationMethod: z.string().optional(),
  archivedAt: z.string().nullable().optional(),
});
export type SourceDto = z.infer<typeof sourceSchema>;

export const createSourceSchema = z
  .object({
    householdId: z.string().uuid(),
    providerId: z.string().min(1).max(80),
    name: z.string().min(1).max(160).optional(),
    domain: dataSourceDomainSchema.optional(),
    protocol: z.string().min(1).max(40).optional(),
    authenticationMethod: z.string().min(1).max(40).optional(),
    connectionStatus: connectionStatusSchema.optional().default("CONNECTED"),
  })
  .strict();
export type CreateSourceInput = z.input<typeof createSourceSchema>;

export const updateSourceSchema = z
  .object({
    householdId: z.string().uuid(),
    name: z.string().min(1).max(160).optional(),
    connectionStatus: connectionStatusSchema.optional(),
    domain: dataSourceDomainSchema.optional(),
  })
  .strict();
export type UpdateSourceInput = z.input<typeof updateSourceSchema>;

export const reconnectSourceSchema = z
  .object({
    householdId: z.string().uuid(),
  })
  .strict();
export type ReconnectSourceInput = z.input<typeof reconnectSourceSchema>;

export const syncSourceSchema = z
  .object({
    householdId: z.string().uuid(),
    sourceId: z.string().uuid().optional(),
  })
  .strict();
export type SyncSourceInput = z.input<typeof syncSourceSchema>;

export const integrationsResponseSchema = z.object({
  asOf: z.string(),
  sources: z.array(sourceSchema),
  recentSyncs: z.array(
    z.object({
      id: z.string(),
      sourceId: z.string().nullable().optional(),
      sourceName: z.string().nullable().optional(),
      status: z.string(),
      recordsFetched: z.number(),
      message: z.string().nullable(),
      startedAt: z.string(),
      completedAt: z.string().nullable(),
    }),
  ),
  providers: z
    .array(
      z.object({
        providerId: z.string(),
        name: z.string(),
        domain: z.string(),
        protocol: z.string(),
        authenticationMethod: z.string(),
      }),
    )
    .optional()
    .default([]),
});
export type IntegrationsResponse = z.infer<typeof integrationsResponseSchema>;

export const importsResponseSchema = z.object({
  asOf: z.string(),
  batches: z.array(
    z.object({
      id: z.string(),
      sourceId: z.string().nullable(),
      sourceName: z.string().nullable(),
      status: z.string(),
      totalRecords: z.number(),
      createdCount: z.number(),
      updatedCount: z.number(),
      ignoredCount: z.number(),
      failedCount: z.number(),
      startedAt: z.string(),
      completedAt: z.string().nullable(),
    }),
  ),
});
export type ImportsResponse = z.infer<typeof importsResponseSchema>;

export const syncResultSchema = z.object({
  ok: z.boolean(),
  syncRunId: z.string().uuid(),
  importBatchId: z.string().uuid().nullable().optional(),
  sourceId: z.string().uuid().nullable().optional(),
});
export type SyncResultDto = z.infer<typeof syncResultSchema>;
