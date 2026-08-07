import { Inject, Injectable } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import { money, moneyToJson, type CurrencyCode } from "@ffos/domain";
import { getDb } from "../db/client";
import { dataSources, importBatches } from "../db/schema-economic";
import { documents, syncRuns } from "../db/schema-intake";
import { HouseholdAccessService } from "../households/household-access.service";

@Injectable()
export class IntakeService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
  ) {}

  async documents(userId: string, householdId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    const db = getDb();
    const rows = await db
      .select()
      .from(documents)
      .where(eq(documents.householdId, householdId))
      .orderBy(desc(documents.receivedAt));
    return {
      asOf,
      items: rows.map((d) => ({
        id: d.id,
        title: d.title,
        documentType: d.documentType,
        status: d.status,
        issuer: d.issuer,
        amount: d.amountMinor
          ? moneyToJson(money(d.amountMinor, (d.currency as CurrencyCode) || currency))
          : null,
        sourceName: d.sourceName,
        receivedAt: d.receivedAt.toISOString(),
        notes: d.notes,
      })),
    };
  }

  async integrations(userId: string, householdId: string) {
    await this.access.requireMembership(userId, householdId);
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    const db = getDb();
    const sources = await db
      .select()
      .from(dataSources)
      .where(eq(dataSources.householdId, householdId));
    const syncs = await db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.householdId, householdId))
      .orderBy(desc(syncRuns.startedAt))
      .limit(10);
    return {
      asOf,
      sources: sources.map((s) => ({
        id: s.id,
        name: s.name,
        providerId: s.providerId,
        connectionStatus: s.connectionStatus,
        freshnessLabel: s.freshnessLabel,
        lastSyncedAt: s.lastSyncedAt?.toISOString() ?? null,
        domain: s.domain,
      })),
      recentSyncs: syncs.map((s) => ({
        id: s.id,
        status: s.status,
        recordsFetched: s.recordsFetched,
        message: s.message,
        startedAt: s.startedAt.toISOString(),
        completedAt: s.completedAt?.toISOString() ?? null,
      })),
    };
  }

  async imports(userId: string, householdId: string) {
    await this.access.requireMembership(userId, householdId);
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    const db = getDb();
    const batches = await db
      .select()
      .from(importBatches)
      .where(eq(importBatches.householdId, householdId))
      .orderBy(desc(importBatches.startedAt))
      .limit(20);
    return {
      asOf,
      batches: batches.map((b) => ({
        id: b.id,
        status: b.status,
        totalRecords: b.totalRecords,
        createdCount: b.createdCount,
        startedAt: b.startedAt.toISOString(),
        completedAt: b.completedAt?.toISOString() ?? null,
      })),
    };
  }

  async fakeSync(userId: string, householdId: string) {
    await this.access.requireMembership(userId, householdId);
    const db = getDb();
    const [source] = await db
      .select()
      .from(dataSources)
      .where(eq(dataSources.householdId, householdId))
      .limit(1);
    const now = new Date();
    const [run] = await db
      .insert(syncRuns)
      .values({
        householdId,
        sourceId: source?.id,
        startedAt: now,
        completedAt: now,
        status: "COMPLETED",
        recordsFetched: 3,
        message: "Fake sync triggered from UI",
      })
      .returning();
    if (source) {
      await db
        .update(dataSources)
        .set({
          lastSyncedAt: now,
          freshnessLabel: "just nu",
          connectionStatus: "CONNECTED",
        })
        .where(eq(dataSources.id, source.id));
    }
    return { ok: true, syncRunId: run.id };
  }
}
