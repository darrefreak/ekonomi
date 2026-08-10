import { z } from "zod";

export const coverageAreaSchema = z.object({
  key: z.string(),
  label: z.string(),
  status: z.enum(["present", "warning", "missing"]),
});

export const coverageResponseSchema = z.object({
  percent: z.number(),
  asOf: z.string(),
  areas: z.array(coverageAreaSchema),
  freshness: z.array(
    z.object({
      sourceName: z.string(),
      status: z.string(),
      freshnessLabel: z.string().nullable(),
      lastSyncedAt: z.string().nullable(),
    }),
  ),
  freshnessSummary: z.string().optional(),
});

export type CoverageResponse = z.infer<typeof coverageResponseSchema>;
