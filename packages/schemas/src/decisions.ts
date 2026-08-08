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

export const opportunitiesResponseSchema = z.object({
  asOf: z.string(),
  source: z.enum(["live-engine", "seed"]).optional().default("live-engine"),
  items: z.array(
    z.object({
      id: z.string(),
      detectorKey: z.string().optional(),
      title: z.string(),
      description: z.string(),
      estimatedAnnualSaving: moneySchema.nullable(),
      /** Heuristic / formula basis — never present savings as guaranteed. */
      estimateBasis: z.string().nullable().optional(),
      confidence: z.number().nullable(),
      effort: z.string(),
      risk: z.string(),
      priority: z.number(),
      status: z.string(),
      category: z.string(),
      evidence: z.array(evidenceLinkSchema).default([]),
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
