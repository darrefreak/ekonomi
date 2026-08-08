import { z } from "zod";
import { amountMinorStringSchema } from "./common";
import { moneySchema } from "./money";

const minorString = amountMinorStringSchema;

export const forecastPointSchema = z.object({
  onDate: z.string(),
  label: z.string(),
  projectedCash: moneySchema,
  projectedNetWorth: moneySchema,
});

export const forecastResponseSchema = z.object({
  asOf: z.string(),
  source: z.enum(["live-engine", "seeded-run"]).optional().default("live-engine"),
  baseline: z
    .object({
      availableCash: moneySchema,
      netWorth: moneySchema,
      monthlyNetSavings: moneySchema,
    })
    .optional(),
  points: z.array(forecastPointSchema),
  optimizer: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      estimatedAnnualSaving: moneySchema,
      effort: z.string(),
    }),
  ),
});
export type ForecastResponse = z.infer<typeof forecastResponseSchema>;

export const forecastBacktestResponseSchema = z.object({
  asOf: z.string(),
  pastAsOf: z.string(),
  lookbackDays: z.number(),
  comparisons: z.array(
    z.object({
      label: z.string(),
      onDate: z.string(),
      projectedCash: moneySchema,
      actualCash: moneySchema,
      projectedNetWorth: moneySchema,
      actualNetWorth: moneySchema,
      cashError: moneySchema,
      netWorthError: moneySchema,
    }),
  ),
  metrics: z.array(
    z.object({
      horizonLabel: z.string(),
      sampleCount: z.number(),
      mapeCashPercent: z.number().nullable(),
      mapeNetWorthPercent: z.number().nullable(),
      absCashError: moneySchema,
      absNetWorthError: moneySchema,
    }),
  ),
});
export type ForecastBacktestResponse = z.infer<typeof forecastBacktestResponseSchema>;

export const evidenceLinkSchema = z.object({
  kind: z.string(),
  id: z.string(),
  label: z.string(),
  href: z.string(),
});

export const opportunityFactSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.string(),
  amountMinor: minorString.optional(),
});

export const opportunitiesResponseSchema = z.object({
  asOf: z.string(),
  source: z.enum(["live-engine", "seed"]).optional().default("live-engine"),
  items: z.array(
    z.object({
      id: z.string(),
      /** V1 opportunity type, e.g. MORTGAGE_RATE / SUBSCRIPTION_PRICE_INCREASE. */
      type: z.string().optional(),
      detectorKey: z.string().optional(),
      title: z.string(),
      description: z.string(),
      estimatedAnnualSaving: moneySchema.nullable(),
      /** Nullable monthly impact — same sign/basis as estimatedAnnualSaving. */
      estimatedMonthlyImpact: moneySchema.nullable().optional(),
      /** Heuristic / formula basis — never present savings as guaranteed. */
      estimateBasis: z.string().nullable().optional(),
      /** Explicit assumptions behind the estimate (shown as "Why?" in UI). */
      assumptions: z.array(z.string()).default([]),
      /** Structured explainability facts (not AI prose). */
      facts: z.array(opportunityFactSchema).default([]),
      /** Data sources feeding the calculation. */
      dataSources: z.array(z.string()).default([]),
      confidence: z.number().nullable(),
      /** Human label mirroring `confidence` (low/medium/high). */
      confidenceLabel: z.enum(["low", "medium", "high"]).optional(),
      /** Composite deterministic priority score 0..1 (higher = more important). */
      priorityScore: z.number().optional(),
      effort: z.string(),
      risk: z.string(),
      priority: z.number(),
      status: z.string(),
      category: z.string(),
      evidence: z.array(evidenceLinkSchema).default([]),
      /** Opportunity engine catalog version this row was computed under. */
      calculationVersion: z.string().optional(),
      /** Deterministic fingerprint of the inputs used to compute this opportunity. */
      inputHash: z.string().optional(),
      /** When the underlying data was last (re)calculated — freshness for UI. */
      lastCalculatedAt: z.string().nullable().optional(),
      /** Analysis freshness state ("live" when computed synchronously). */
      analysisStatus: z.enum(["live", "stale", "pending"]).optional(),
    }),
  ),
  lifestyleCreep: z
    .object({
      creeping: z.boolean(),
      recentAvgMonthly: moneySchema,
      baselineAvgMonthly: moneySchema,
      delta: moneySchema,
      deltaPercent: z.number().nullable(),
      drivers: z.array(
        z.object({
          categoryKey: z.string(),
          categoryName: z.string(),
          delta: moneySchema,
          deltaPercent: z.number().nullable(),
          href: z.string(),
        }),
      ),
    })
    .nullable()
    .optional(),
});
export type OpportunitiesResponse = z.infer<typeof opportunitiesResponseSchema>;

export const riskResponseSchema = z.object({
  asOf: z.string(),
  source: z.enum(["live-engine", "seed"]).optional().default("live-engine"),
  signals: z.array(
    z.object({
      id: z.string(),
      dimension: z.string(),
      level: z.string(),
      title: z.string(),
      detail: z.string(),
      score: z.number(),
      evidence: z.array(evidenceLinkSchema).default([]),
    }),
  ),
  health: z.array(
    z.object({
      dimension: z.string(),
      score: z.number(),
      level: z.string(),
      summary: z.string(),
    }),
  ),
});
export type RiskResponse = z.infer<typeof riskResponseSchema>;

export const scenarioAssumptionsSchema = z
  .object({
    monthlyIncomeDeltaMinor: minorString.optional(),
    monthlyExpenseDeltaMinor: minorString.optional(),
    oneTimeCashDeltaMinor: minorString.optional(),
    mortgageRateDeltaBps: z.number().int().min(-5000).max(5000).optional(),
  })
  .strict();
export type ScenarioAssumptionsInput = z.infer<typeof scenarioAssumptionsSchema>;

export const scenarioItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  status: z.string(),
  projectedMonthlyDelta: moneySchema,
  assumptions: z.record(z.unknown()),
});

export const scenariosResponseSchema = z.object({
  asOf: z.string(),
  items: z.array(scenarioItemSchema),
});
export type ScenariosResponse = z.infer<typeof scenariosResponseSchema>;

export const createScenarioSchema = z
  .object({
    householdId: z.string().uuid(),
    name: z.string().min(1).max(160),
    description: z.string().max(2000).optional().default(""),
    assumptions: scenarioAssumptionsSchema.optional().default({}),
  })
  .strict();
export type CreateScenarioInput = z.input<typeof createScenarioSchema>;

export const simulateScenarioSchema = z
  .object({
    householdId: z.string().uuid(),
    /** Optional override; defaults to stored scenario assumptions. */
    assumptions: scenarioAssumptionsSchema.optional(),
  })
  .strict();
export type SimulateScenarioInput = z.input<typeof simulateScenarioSchema>;

export const scenarioSimulationResponseSchema = z.object({
  asOf: z.string(),
  scenarioId: z.string(),
  name: z.string(),
  ledgerMutated: z.literal(false),
  projectedMonthlyDelta: moneySchema,
  baselineMonthlySavings: moneySchema,
  adjustedMonthlySavings: moneySchema,
  assumptions: z.record(z.unknown()),
  points: z.array(forecastPointSchema),
});
export type ScenarioSimulationResponse = z.infer<
  typeof scenarioSimulationResponseSchema
>;

export const insightsResponseSchema = z.object({
  asOf: z.string(),
  headline: z.string(),
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      detail: z.string(),
      kind: z.string(),
    }),
  ),
});
export type InsightsResponse = z.infer<typeof insightsResponseSchema>;

export const anomalyFactSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.string(),
});

export const anomalyItemSchema = z.object({
  id: z.string().uuid(),
  ruleKey: z.string(),
  title: z.string(),
  detail: z.string(),
  severity: z.string(),
  entityId: z.string().uuid().nullable(),
  entityKind: z.string().nullable(),
  amountMinor: minorString.nullable(),
  asOf: z.string(),
  facts: z.array(anomalyFactSchema).default([]),
  identityKey: z.string(),
  href: z.string().nullable(),
  createdAt: z.string(),
});

export const anomaliesResponseSchema = z.object({
  asOf: z.string(),
  items: z.array(anomalyItemSchema),
});
export type AnomaliesResponse = z.infer<typeof anomaliesResponseSchema>;

export const dismissAnomalySchema = z
  .object({
    householdId: z.string().uuid(),
  })
  .strict();
export type DismissAnomalyInput = z.infer<typeof dismissAnomalySchema>;

export const analysisRunItemSchema = z.object({
  id: z.string().uuid(),
  kind: z.string(),
  status: z.string(),
  asOf: z.string(),
  calculationVersion: z.string().nullable(),
  jobId: z.string().nullable(),
  errorCode: z.string().nullable(),
  summary: z.record(z.unknown()),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const analysisRunsResponseSchema = z.object({
  items: z.array(analysisRunItemSchema),
});
export type AnalysisRunsResponse = z.infer<typeof analysisRunsResponseSchema>;
