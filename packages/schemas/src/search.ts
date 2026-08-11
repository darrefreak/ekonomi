import { z } from "zod";

export const searchResultSchema = z.object({
  type: z.enum([
    "transaction",
    "account",
    "merchant",
    "category",
    "subscription",
    "document",
    "vehicle",
    "opportunity",
    "page",
    "action",
  ]),
  id: z.string(),
  title: z.string(),
  subtitle: z.string().nullable().optional(),
  href: z.string(),
});

export const searchResponseSchema = z.object({
  query: z.string(),
  results: z.array(searchResultSchema),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;
