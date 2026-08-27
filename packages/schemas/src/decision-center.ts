import { z } from "zod";
import { currencyCodeSchema } from "./common";
import { evidenceLinkSchema } from "./decisions";
import { moneySchema } from "./money";

/**
 * The Decision Center: one ranked list of concrete things to do, composed from
 * every deterministic engine (opportunities, debt payoff, liquidity, savings,
 * anomalies, brief findings). It owns no maths — it arranges what the engines
 * already compute into a single "what should I do next, and how much is it
 * worth" feed, ranked by financial impact and confidence.
 */

export const decisionActionCategorySchema = z.enum([
  "DEBT",
  "SUBSCRIPTIONS",
  "SPENDING",
  "LIQUIDITY",
  "SAVINGS",
  "VEHICLE",
  "INCOME",
  "BUDGET",
  "RISK",
  "OTHER",
]);
export type DecisionActionCategory = z.infer<typeof decisionActionCategorySchema>;

export const decisionActionSourceSchema = z.enum([
  "opportunity",
  "debt",
  "savings",
  "liquidity",
  "anomaly",
  "brief",
  "risk",
]);

/** Visual/urgency tone; not a color, a meaning. */
export const decisionActionToneSchema = z.enum([
  "critical",
  "warning",
  "opportunity",
  "positive",
  "info",
]);

export const decisionActionSchema = z.object({
  id: z.string(),
  source: decisionActionSourceSchema,
  category: decisionActionCategorySchema,
  /** Short, plain-Swedish headline. */
  title: z.string(),
  /** What is going on — the observation. */
  detail: z.string(),
  /** The concrete move to make. */
  recommendation: z.string(),
  /** Impact in its natural horizon (may be null when not quantifiable). */
  impact: moneySchema.nullable(),
  impactHorizon: z.enum(["annual", "monthly", "oneoff"]).nullable(),
  /** Impact normalised to a yearly figure, for ranking and totals. */
  annualImpactMinor: z.string().nullable(),
  confidence: z.number().nullable(),
  confidenceLabel: z.enum(["low", "medium", "high"]).nullable(),
  effort: z.string().nullable(),
  tone: decisionActionToneSchema,
  /** Deterministic rank score 0–1 (higher = act sooner). */
  score: z.number(),
  href: z.string(),
  evidence: z.array(evidenceLinkSchema).default([]),
});
export type DecisionAction = z.infer<typeof decisionActionSchema>;

export const decisionsCenterResponseSchema = z.object({
  asOf: z.string(),
  currency: currencyCodeSchema,
  headline: z.string(),
  /** Indicative sum of positive yearly impact across the actions. */
  totalAnnualOpportunity: moneySchema,
  actions: z.array(decisionActionSchema),
  categories: z.array(
    z.object({
      key: decisionActionCategorySchema,
      label: z.string(),
      count: z.number(),
    }),
  ),
  /** Honest note when the picture rests on partial data. */
  coverageNote: z.string().nullable(),
});
export type DecisionsCenterResponse = z.infer<typeof decisionsCenterResponseSchema>;
