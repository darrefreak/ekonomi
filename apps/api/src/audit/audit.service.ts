import { Injectable } from "@nestjs/common";
import { getDb } from "../db/client";
import { auditLogs } from "../db/schema";

export type AuditRecordInput = {
  householdId?: string | null;
  actorUserId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  requestId?: string | null;
  source?: string;
};

@Injectable()
export class AuditService {
  async record(input: AuditRecordInput) {
    const db = getDb();
    const [row] = await db
      .insert(auditLogs)
      .values({
        householdId: input.householdId ?? null,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        before: input.before ?? null,
        after: input.after ?? null,
        requestId: input.requestId ?? null,
        source: input.source ?? "api",
      })
      .returning();
    return row;
  }
}
