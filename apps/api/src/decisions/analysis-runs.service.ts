import { Inject, Injectable, Optional } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { analysisRuns } from "../db/schema-decisions";
import { HouseholdAccessService } from "../households/household-access.service";

export type AnalysisRunRecordInput = {
  householdId: string;
  kind: string;
  status: "RUNNING" | "READY" | "FAILED";
  asOf: string;
  calculationVersion?: string | null;
  jobId?: string | null;
  errorCode?: string | null;
  summary?: Record<string, unknown>;
  startedAt?: Date;
  finishedAt?: Date | null;
};

/**
 * Thin persistence for analysis/job run status (P1-U5).
 * getDb()-based so job workers can record without Nest DI.
 */
@Injectable()
export class AnalysisRunsService {
  constructor(
    @Optional()
    @Inject(HouseholdAccessService)
    private readonly access?: HouseholdAccessService,
  ) {}

  async record(input: AnalysisRunRecordInput) {
    const db = getDb();
    const [row] = await db
      .insert(analysisRuns)
      .values({
        householdId: input.householdId,
        kind: input.kind,
        status: input.status,
        asOf: input.asOf,
        calculationVersion: input.calculationVersion ?? null,
        jobId: input.jobId ?? null,
        errorCode: input.errorCode ?? null,
        summary: input.summary ?? {},
        startedAt: input.startedAt ?? new Date(),
        finishedAt: input.finishedAt ?? null,
      })
      .returning();
    return row;
  }

  async listForUser(userId: string, householdId: string, limit = 25) {
    if (this.access) {
      await this.access.requireMembership(userId, householdId);
    }
    return this.list(householdId, limit);
  }

  async list(householdId: string, limit = 25) {
    const db = getDb();
    const rows = await db
      .select()
      .from(analysisRuns)
      .where(eq(analysisRuns.householdId, householdId))
      .orderBy(desc(analysisRuns.createdAt))
      .limit(limit);

    return {
      items: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        status: r.status,
        asOf: r.asOf,
        calculationVersion: r.calculationVersion,
        jobId: r.jobId,
        errorCode: r.errorCode,
        summary: r.summary ?? {},
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}
