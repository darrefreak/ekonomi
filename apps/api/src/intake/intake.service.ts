import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, isNull } from "drizzle-orm";
import { money, moneyToJson, type CurrencyCode } from "@ffos/domain";
import { computeFreshnessLabel } from "@ffos/financial-engine";
import type {
  CreateSourceInput,
  ReconnectSourceInput,
  UpdateDocumentInput,
  UpdateSourceInput,
  UploadDocumentInput,
} from "@ffos/schemas";
import { mockProviderCatalog } from "@ffos/schemas";
import { getDb } from "../db/client";
import {
  accounts,
  dataSources,
  importBatches,
  rawImportRecords,
} from "../db/schema-economic";
import { documents, syncRuns } from "../db/schema-intake";
import { vehicles } from "../db/schema-vehicles";
import { HouseholdAccessService } from "../households/household-access.service";
import { ObjectStorageService } from "../storage/object-storage.service";
import { mockExtractDocument } from "./mock-extract";
import { createHash } from "node:crypto";

const ALLOWED_STATUS: Record<string, string[]> = {
  NEW: ["PROCESSING", "REVIEW", "ACTION_REQUIRED", "ARCHIVED"],
  PROCESSING: ["REVIEW", "ACTION_REQUIRED", "ARCHIVED"],
  REVIEW: ["ACTION_REQUIRED", "ARCHIVED", "PROCESSING"],
  ACTION_REQUIRED: ["REVIEW", "ARCHIVED"],
  ARCHIVED: ["REVIEW"],
};

@Injectable()
export class IntakeService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(ObjectStorageService) private readonly storage: ObjectStorageService,
  ) {}

  private toItem(
    d: typeof documents.$inferSelect,
    currency: CurrencyCode,
    downloadUrl: string | null = null,
  ) {
    return {
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
      extracted: (d.extracted ?? {}) as Record<string, unknown>,
      storageKey: d.storageKey,
      contentType: d.contentType,
      byteSize: d.byteSize,
      originalFilename: d.originalFilename,
      vehicleId: d.vehicleId,
      accountId: d.accountId,
      downloadUrl,
    };
  }

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
      items: rows.map((d) => this.toItem(d, currency)),
    };
  }

  async getDocument(userId: string, householdId: string, documentId: string) {
    const { household } = await this.access.requireMembership(userId, householdId);
    const currency = (household.baseCurrency || "SEK") as CurrencyCode;
    const db = getDb();
    const [row] = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.id, documentId),
          eq(documents.householdId, householdId),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException("Document not found");
    const downloadUrl = row.storageKey
      ? await this.storage.getSignedGetUrl(row.storageKey, row.bucket)
      : null;
    return {
      ...this.toItem(row, currency, downloadUrl),
      checksumSha256: row.checksumSha256,
      bucket: row.bucket,
      storageDriver: row.bucket === "local" ? "local" : row.storageKey ? "s3" : null,
    };
  }

  async uploadDocument(userId: string, input: UploadDocumentInput) {
    await this.access.requireCanWrite(userId, input.householdId);
    await this.assertLinks(input.householdId, input.vehicleId, input.accountId);

    let body: Buffer;
    try {
      body = Buffer.from(input.contentBase64, "base64");
    } catch {
      throw new BadRequestException("Invalid contentBase64");
    }
    if (!body.byteLength) throw new BadRequestException("Empty file");
    if (body.byteLength > 5_000_000) {
      throw new BadRequestException("File too large (max 5MB in V1)");
    }

    const stored = await this.storage.putObject({
      householdId: input.householdId,
      filename: input.filename,
      contentType: input.contentType ?? "application/octet-stream",
      body,
    });

    const extract = mockExtractDocument({
      title: input.title,
      documentType: input.documentType ?? "OTHER",
      filename: input.filename,
      contentType: stored.contentType,
      byteSize: stored.byteSize,
    });

    const db = getDb();
    const [row] = await db
      .insert(documents)
      .values({
        householdId: input.householdId,
        title: input.title,
        documentType: input.documentType ?? "OTHER",
        status: extract.status,
        issuer: extract.issuer,
        amountMinor: extract.amountMinor,
        currency: "SEK",
        extracted: extract.extracted,
        sourceName: "Upload",
        notes: input.notes ?? extract.notes,
        storageKey: stored.storageKey,
        bucket: stored.bucket,
        contentType: stored.contentType,
        byteSize: stored.byteSize,
        checksumSha256: stored.checksumSha256,
        originalFilename: input.filename,
        vehicleId: input.vehicleId ?? null,
        accountId: input.accountId ?? null,
        updatedAt: new Date(),
      })
      .returning();

    return this.getDocument(userId, input.householdId, row.id);
  }

  async updateDocument(
    userId: string,
    documentId: string,
    input: UpdateDocumentInput,
  ) {
    await this.access.requireCanWrite(userId, input.householdId);
    const db = getDb();
    const [existing] = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.id, documentId),
          eq(documents.householdId, input.householdId),
        ),
      )
      .limit(1);
    if (!existing) throw new NotFoundException("Document not found");

    if (input.status && input.status !== existing.status) {
      const allowed = ALLOWED_STATUS[existing.status] ?? [];
      if (!allowed.includes(input.status)) {
        throw new BadRequestException(
          `Invalid status transition ${existing.status} → ${input.status}`,
        );
      }
    }

    await this.assertLinks(
      input.householdId,
      input.vehicleId === undefined ? undefined : input.vehicleId,
      input.accountId === undefined ? undefined : input.accountId,
    );

    await db
      .update(documents)
      .set({
        status: input.status ?? existing.status,
        documentType: input.documentType ?? existing.documentType,
        notes: input.notes === undefined ? existing.notes : input.notes,
        title: input.title ?? existing.title,
        vehicleId:
          input.vehicleId === undefined ? existing.vehicleId : input.vehicleId,
        accountId:
          input.accountId === undefined ? existing.accountId : input.accountId,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    return this.getDocument(userId, input.householdId, documentId);
  }

  async reextract(userId: string, householdId: string, documentId: string) {
    await this.access.requireMembership(userId, householdId);
    const db = getDb();
    const [existing] = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.id, documentId),
          eq(documents.householdId, householdId),
        ),
      )
      .limit(1);
    if (!existing) throw new NotFoundException("Document not found");

    const extract = mockExtractDocument({
      title: existing.title,
      documentType: existing.documentType,
      filename: existing.originalFilename,
      contentType: existing.contentType,
      byteSize: existing.byteSize,
      issuerHint: existing.issuer,
    });

    await db
      .update(documents)
      .set({
        status: extract.status,
        issuer: extract.issuer ?? existing.issuer,
        amountMinor: extract.amountMinor ?? existing.amountMinor,
        extracted: extract.extracted,
        notes: extract.notes,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    return this.getDocument(userId, householdId, documentId);
  }

  private async assertLinks(
    householdId: string,
    vehicleId?: string | null,
    accountId?: string | null,
  ) {
    const db = getDb();
    if (vehicleId) {
      const [v] = await db
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(
          and(eq(vehicles.id, vehicleId), eq(vehicles.householdId, householdId)),
        )
        .limit(1);
      if (!v) throw new NotFoundException("Vehicle not found");
    }
    if (accountId) {
      const [a] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(
          and(eq(accounts.id, accountId), eq(accounts.householdId, householdId)),
        )
        .limit(1);
      if (!a) throw new NotFoundException("Account not found");
    }
  }

  private mapSource(
    s: typeof dataSources.$inferSelect,
    asOf: string,
  ) {
    const freshnessLabel = computeFreshnessLabel({
      lastSyncedAt: s.lastSyncedAt,
      connectionStatus: s.connectionStatus,
      asOf,
    });
    return {
      id: s.id,
      name: s.name,
      providerId: s.providerId,
      connectionStatus: s.connectionStatus,
      freshnessLabel,
      lastSyncedAt: s.lastSyncedAt?.toISOString() ?? null,
      domain: s.domain,
      protocol: s.protocol,
      authenticationMethod: s.authenticationMethod,
      archivedAt: s.archivedAt?.toISOString() ?? null,
    };
  }

  async integrations(userId: string, householdId: string) {
    await this.access.requireMembership(userId, householdId);
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    const db = getDb();
    const sources = await db
      .select()
      .from(dataSources)
      .where(
        and(
          eq(dataSources.householdId, householdId),
          isNull(dataSources.archivedAt),
        ),
      )
      .orderBy(desc(dataSources.updatedAt));
    const syncs = await db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.householdId, householdId))
      .orderBy(desc(syncRuns.startedAt))
      .limit(10);
    const nameRows = await db
      .select({ id: dataSources.id, name: dataSources.name })
      .from(dataSources)
      .where(eq(dataSources.householdId, householdId));
    const sourceNameById = new Map(nameRows.map((s) => [s.id, s.name]));

    return {
      asOf,
      sources: sources.map((s) => this.mapSource(s, asOf)),
      recentSyncs: syncs.map((s) => ({
        id: s.id,
        sourceId: s.sourceId,
        sourceName: s.sourceId
          ? sourceNameById.get(s.sourceId) ?? null
          : null,
        status: s.status,
        recordsFetched: s.recordsFetched,
        message: s.message,
        startedAt: s.startedAt.toISOString(),
        completedAt: s.completedAt?.toISOString() ?? null,
      })),
      providers: [...mockProviderCatalog],
    };
  }

  async createSource(userId: string, input: CreateSourceInput) {
    await this.access.requireCanWrite(userId, input.householdId);
    const catalog = mockProviderCatalog.find(
      (p) => p.providerId === input.providerId,
    );
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    const db = getDb();
    const [row] = await db
      .insert(dataSources)
      .values({
        householdId: input.householdId,
        providerId: input.providerId,
        name: input.name ?? catalog?.name ?? input.providerId,
        domain: input.domain ?? catalog?.domain ?? "OTHER",
        protocol: input.protocol ?? catalog?.protocol ?? "MANUAL",
        authenticationMethod:
          input.authenticationMethod ??
          catalog?.authenticationMethod ??
          "NONE",
        connectionStatus: input.connectionStatus ?? "CONNECTED",
        lastSyncedAt: null,
        freshnessLabel: null,
        updatedAt: new Date(),
      })
      .returning();
    return this.mapSource(row, asOf);
  }

  async updateSource(
    userId: string,
    sourceId: string,
    input: UpdateSourceInput,
  ) {
    await this.access.requireCanWrite(userId, input.householdId);
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    const db = getDb();
    const existing = await this.requireSource(input.householdId, sourceId);
    const [row] = await db
      .update(dataSources)
      .set({
        name: input.name ?? existing.name,
        connectionStatus: input.connectionStatus ?? existing.connectionStatus,
        domain: input.domain ?? existing.domain,
        updatedAt: new Date(),
      })
      .where(eq(dataSources.id, sourceId))
      .returning();
    return this.mapSource(row, asOf);
  }

  async archiveSource(userId: string, householdId: string, sourceId: string) {
    await this.access.requireMembership(userId, householdId);
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    await this.requireSource(householdId, sourceId);
    const db = getDb();
    const now = new Date();
    const [row] = await db
      .update(dataSources)
      .set({
        archivedAt: now,
        connectionStatus: "DISCONNECTED",
        freshnessLabel: "frånkopplad",
        updatedAt: now,
      })
      .where(eq(dataSources.id, sourceId))
      .returning();
    return this.mapSource(row, asOf);
  }

  async reconnectSource(
    userId: string,
    sourceId: string,
    input: ReconnectSourceInput,
  ) {
    await this.access.requireCanWrite(userId, input.householdId);
    const existing = await this.requireSource(input.householdId, sourceId);
    if (
      !["AUTH_REQUIRED", "ERROR", "DISCONNECTED", "DEGRADED"].includes(
        existing.connectionStatus,
      )
    ) {
      throw new BadRequestException(
        `Reconnect not needed for status ${existing.connectionStatus}`,
      );
    }
    const db = getDb();
    await db
      .update(dataSources)
      .set({
        connectionStatus: "CONNECTED",
        archivedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(dataSources.id, sourceId));
    return this.fakeSync(userId, input.householdId, sourceId, "Mock reconnect");
  }

  async imports(userId: string, householdId: string) {
    await this.access.requireMembership(userId, householdId);
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    const db = getDb();
    const batches = await db
      .select({
        batch: importBatches,
        sourceName: dataSources.name,
      })
      .from(importBatches)
      .leftJoin(dataSources, eq(importBatches.sourceId, dataSources.id))
      .where(eq(importBatches.householdId, householdId))
      .orderBy(desc(importBatches.startedAt))
      .limit(30);
    return {
      asOf,
      batches: batches.map(({ batch: b, sourceName }) => ({
        id: b.id,
        sourceId: b.sourceId,
        sourceName: sourceName ?? null,
        status: b.status,
        totalRecords: b.totalRecords,
        createdCount: b.createdCount,
        updatedCount: b.updatedCount,
        ignoredCount: b.ignoredCount,
        failedCount: b.failedCount,
        startedAt: b.startedAt.toISOString(),
        completedAt: b.completedAt?.toISOString() ?? null,
      })),
    };
  }

  async fakeSync(
    userId: string,
    householdId: string,
    sourceId?: string,
    message = "Fake sync triggered from UI",
  ) {
    await this.access.requireMembership(userId, householdId);
    const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
    const db = getDb();

    let source: typeof dataSources.$inferSelect | undefined;
    if (sourceId) {
      source = await this.requireSource(householdId, sourceId);
    } else {
      const [first] = await db
        .select()
        .from(dataSources)
        .where(
          and(
            eq(dataSources.householdId, householdId),
            isNull(dataSources.archivedAt),
          ),
        )
        .limit(1);
      source = first;
    }

    const now = new Date(`${asOf}T12:00:00.000Z`);
    const recordsFetched = 3;
    const [run] = await db
      .insert(syncRuns)
      .values({
        householdId,
        sourceId: source?.id,
        startedAt: now,
        completedAt: now,
        status: "COMPLETED",
        recordsFetched,
        message,
      })
      .returning();

    let importBatchId: string | null = null;
    if (source) {
      const freshnessLabel = computeFreshnessLabel({
        lastSyncedAt: now,
        connectionStatus: "CONNECTED",
        asOf,
      });
      await db
        .update(dataSources)
        .set({
          lastSyncedAt: now,
          freshnessLabel,
          connectionStatus: "CONNECTED",
          archivedAt: null,
          updatedAt: now,
        })
        .where(eq(dataSources.id, source.id));

      const [batch] = await db
        .insert(importBatches)
        .values({
          householdId,
          sourceId: source.id,
          startedAt: now,
          completedAt: now,
          status: "COMPLETED",
          totalRecords: recordsFetched,
          createdCount: recordsFetched,
          updatedCount: 0,
          ignoredCount: 0,
          failedCount: 0,
        })
        .returning();
      importBatchId = batch.id;

      const payload = {
        provider: source.providerId,
        mock: true,
        asOf,
        note: message,
      };
      const hash = createHash("sha256")
        .update(`${source.id}:${run.id}:${JSON.stringify(payload)}`)
        .digest("hex");
      await db.insert(rawImportRecords).values({
        householdId,
        provider: source.providerId,
        sourceId: source.id,
        importBatchId: batch.id,
        payload,
        hash,
        processingStatus: "COMPLETED",
        schemaVersion: "1",
        receivedAt: now,
      });
    }

    return {
      ok: true,
      syncRunId: run.id,
      importBatchId,
      sourceId: source?.id ?? null,
    };
  }

  private async requireSource(householdId: string, sourceId: string) {
    const db = getDb();
    const [row] = await db
      .select()
      .from(dataSources)
      .where(
        and(
          eq(dataSources.id, sourceId),
          eq(dataSources.householdId, householdId),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException("Source not found");
    return row;
  }
}
