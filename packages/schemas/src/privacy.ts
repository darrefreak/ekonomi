import { z } from "zod";

export const privacyExportRequestSchema = z
  .object({
    householdId: z.string().uuid(),
  })
  .strict();
export type PrivacyExportRequest = z.infer<typeof privacyExportRequestSchema>;

export const privacyExportResponseSchema = z.object({
  householdId: z.string().uuid(),
  exportedAt: z.string(),
  requestId: z.string().uuid().nullable().optional(),
  data: z.record(z.unknown()),
});
export type PrivacyExportResponse = z.infer<typeof privacyExportResponseSchema>;

export const privacyDeleteRequestSchema = z
  .object({
    householdId: z.string().uuid(),
    kind: z
      .enum(["delete_personal", "leave_household", "delete_household"])
      .default("delete_personal"),
    note: z.string().max(500).optional(),
  })
  .strict();
export type PrivacyDeleteRequest = z.input<typeof privacyDeleteRequestSchema>;

export const privacyDeleteResponseSchema = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  kind: z.string(),
  status: z.string(),
  createdAt: z.string(),
});
export type PrivacyDeleteResponse = z.infer<typeof privacyDeleteResponseSchema>;
