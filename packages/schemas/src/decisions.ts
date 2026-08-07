import { z } from "zod";
import { moneySchema } from "./money";

const minorString = z.string().regex(/^-?\d+$/);

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

export const opportunitiesResponseSchema = z.object({
  asOf: z.string(),
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      estimatedAnnualSaving: moneySchema.nullable(),
      confidence: z.number().nullable(),
      effort: z.string(),
      risk: z.string(),
      priority: z.number(),
      status: z.string(),
      category: z.string(),
    }),
  ),
});
export type OpportunitiesResponse = z.infer<typeof opportunitiesResponseSchema>;

export const riskResponseSchema = z.object({
  asOf: z.string(),
  signals: z.array(
    z.object({
      id: z.string(),
      dimension: z.string(),
      level: z.string(),
      title: z.string(),
      detail: z.string(),
      score: z.number(),
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

export const scenarioAssumptionsSchema = z.object({
  monthlyIncomeDeltaMinor: minorString.optional(),
  monthlyExpenseDeltaMinor: minorString.optional(),
  oneTimeCashDeltaMinor: minorString.optional(),
});
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

export const createScenarioSchema = z.object({
  householdId: z.string().uuid(),
  name: z.string().min(1).max(160),
  description: z.string().max(2000).optional().default(""),
  assumptions: scenarioAssumptionsSchema.optional().default({}),
});
export type CreateScenarioInput = z.input<typeof createScenarioSchema>;

export const simulateScenarioSchema = z.object({
  householdId: z.string().uuid(),
  /** Optional override; defaults to stored scenario assumptions. */
  assumptions: scenarioAssumptionsSchema.optional(),
});
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
