import { z } from "zod";
import { currencyCodeSchema, isoDateSchema, uuidSchema } from "./common";
import { moneySchema } from "./money";

export const metricValueKindSchema = z.enum([
  "money_minor",
  "ratio_percent",
  "months",
  "count",
]);

export const metricDefinitionSchema = z.object({
  metricKey: z.string().min(1).max(80),
  displayName: z.string().min(1).max(160),
  formulaDescription: z.string().min(1).max(2000),
  calculationVersion: z.string().min(1).max(40),
  valueKind: metricValueKindSchema,
  unit: z.string().max(40).optional(),
});

export const metricDefinitionsResponseSchema = z.object({
  bundleVersion: z.string(),
  items: z.array(metricDefinitionSchema),
});

export const metricSnapshotSchema = z.object({
  metricKey: z.string(),
  calculationVersion: z.string(),
  asOf: z.string(),
  period: z.string().nullable().optional(),
  currency: currencyCodeSchema.optional(),
  valueMinor: z.string().nullable().optional(),
  valueNumber: z.number().nullable().optional(),
  money: moneySchema.nullable().optional(),
  inputHash: z.string().nullable().optional(),
  coveragePercent: z.number().nullable().optional(),
  freshnessLabel: z.string().nullable().optional(),
  calculatedAt: z.string(),
});

export const metricSnapshotsQuerySchema = z.object({
  householdId: uuidSchema,
  asOf: isoDateSchema.optional(),
});

export const metricSnapshotsResponseSchema = z.object({
  householdId: uuidSchema,
  asOf: z.string(),
  bundleVersion: z.string(),
  inputHash: z.string(),
  calculatedAt: z.string(),
  coveragePercent: z.number().nullable().optional(),
  freshnessLabel: z.string().nullable().optional(),
  items: z.array(metricSnapshotSchema),
});

/** Metadata attached to product responses that consume the registry. */
export const metricMetaSchema = z.object({
  bundleVersion: z.string(),
  calculationVersion: z.string(),
  inputHash: z.string(),
  asOf: z.string(),
});

export type MetricDefinitionDto = z.infer<typeof metricDefinitionSchema>;
export type MetricSnapshotsResponse = z.infer<typeof metricSnapshotsResponseSchema>;
export type MetricMeta = z.infer<typeof metricMetaSchema>;
