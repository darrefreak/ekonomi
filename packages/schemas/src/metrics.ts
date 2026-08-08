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
  /**
   * `live` (default): rematerialize from ledger under current formulas.
   * `stored`: serve persisted snapshot rows without recomputing under newer formulas.
   */
  mode: z.enum(["live", "stored"]).optional(),
  /** Optional filter when mode=stored — exact metric + formula version. */
  metricKey: z.string().min(1).max(80).optional(),
  calculationVersion: z.string().min(1).max(40).optional(),
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
  /** Present when mode=stored — confirms no live rematerialization. */
  servedFrom: z.enum(["live", "stored"]).optional(),
});

/** Metadata attached to product responses that consume the registry. */
export const metricMetaSchema = z.object({
  bundleVersion: z.string(),
  /**
   * Catalog fingerprint of per-metric formula versions — not the bundle semver.
   * Bundle packaging lives in `bundleVersion`.
   */
  calculationVersion: z.string(),
  /** Per-metric calculation versions at the time of the snapshot. */
  metricVersions: z.record(z.string(), z.string()).optional(),
  inputHash: z.string(),
  asOf: z.string(),
});

export type MetricDefinitionDto = z.infer<typeof metricDefinitionSchema>;
export type MetricSnapshotsResponse = z.infer<typeof metricSnapshotsResponseSchema>;
export type MetricMeta = z.infer<typeof metricMetaSchema>;
