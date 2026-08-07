import { z } from "zod";

export const createHouseholdSchema = z.object({
  name: z.string().min(1).max(120),
  baseCurrency: z.enum(["SEK", "EUR", "USD", "NOK", "DKK"]).default("SEK"),
});

export const householdRoleSchema = z.enum([
  "OWNER",
  "ADMIN",
  "ADULT",
  "VIEWER",
  "CHILD",
]);

export type CreateHouseholdInput = z.infer<typeof createHouseholdSchema>;
