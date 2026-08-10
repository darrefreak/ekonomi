import { Injectable } from "@nestjs/common";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client";
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
  /** Join the caller's transaction so the audit row shares its fate. */
  executor?: DbExecutor;
};

@Injectable()
export class AuditService {
  async record(input: AuditRecordInput) {
    const db = input.executor ?? getDb();
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

  async list(householdId: string, limit = 50) {
    const db = getDb();
    const rows = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entity: auditLogs.entity,
        entityId: auditLogs.entityId,
        actorUserId: auditLogs.actorUserId,
        requestId: auditLogs.requestId,
        source: auditLogs.source,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(
        and(eq(auditLogs.householdId, householdId), isNotNull(auditLogs.householdId)),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);

    return {
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        actorUserId: r.actorUserId,
        requestId: r.requestId,
        source: r.source,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}
