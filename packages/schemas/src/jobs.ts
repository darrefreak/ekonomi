import { z } from "zod";
import { isoDateSchema, uuidSchema } from "./common";

export const healthCheckJobPayloadSchema = z
  .object({
    type: z.literal("HEALTH_CHECK"),
    householdId: z.union([uuidSchema, z.literal("system")]),
  })
  .strict();

export const reconcileAccountBalancesJobPayloadSchema = z
  .object({
    type: z.literal("RECONCILE_ACCOUNT_BALANCES"),
    householdId: uuidSchema,
    asOf: isoDateSchema.optional(),
  })
  .strict();

export const jobPayloadSchema = z.discriminatedUnion("type", [
  healthCheckJobPayloadSchema,
  reconcileAccountBalancesJobPayloadSchema,
]);

export type JobPayload = z.infer<typeof jobPayloadSchema>;
