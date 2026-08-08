import { z } from "zod";

export const auditLogItemSchema = z.object({
  id: z.string().uuid(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string().nullable(),
  actorUserId: z.string().uuid().nullable(),
  requestId: z.string().nullable(),
  source: z.string(),
  createdAt: z.string(),
});

export const auditLogsResponseSchema = z.object({
  items: z.array(auditLogItemSchema),
});
export type AuditLogsResponse = z.infer<typeof auditLogsResponseSchema>;
