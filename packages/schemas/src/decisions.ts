import { z } from "zod";
import { moneySchema } from "./money";

export const forecastResponseSchema = z.object({
  asOf: z.string(),
  points: z.array(
    z.object({
      onDate: z.string(),
      label: z.string(),
      projectedCash: moneySchema,
      projectedNetWorth: moneySchema,
    }),
  ),
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

export const scenariosResponseSchema = z.object({
  asOf: z.string(),
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      status: z.string(),
      projectedMonthlyDelta: moneySchema,
      assumptions: z.record(z.unknown()),
    }),
  ),
});
export type ScenariosResponse = z.infer<typeof scenariosResponseSchema>;

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
