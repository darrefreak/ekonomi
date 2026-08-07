import { z } from "zod";

export const advisorBriefResponseSchema = z.object({
  asOf: z.string(),
  briefId: z.string(),
  headline: z.string(),
  disclaimer: z.string(),
  sections: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      sourceTools: z.array(z.string()),
    }),
  ),
  toolTrace: z.array(
    z.object({
      tool: z.string(),
      ok: z.boolean(),
      data: z.record(z.unknown()),
    }),
  ),
});
export type AdvisorBriefResponse = z.infer<typeof advisorBriefResponseSchema>;
