import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { money, moneyToJson, type CurrencyCode } from "@ffos/domain";
import type {
  UpdateDocumentInput,
  UploadDocumentInput,
} from "@ffos/schemas";
import { getDb } from "../db/client";
import { accounts, dataSources, importBatches } from "../db/schema-economic";
import { documents, syncRuns } from "../db/schema-intake";
import { vehicles } from "../db/schema-vehicles";
import { HouseholdAccessService } from "../households/household-access.service";
import { ObjectStorageService } from "../storage/object-storage.service";
import { mockExtractDocument } from "./mock-extract";

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
    await this.access.requireMembership(userId, input.householdId);
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
    await this.access.requireMembership(userId, input.householdId);
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
