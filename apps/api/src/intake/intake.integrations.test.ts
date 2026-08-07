import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import {
  createSourceSchema,
  importsResponseSchema,
  integrationsResponseSchema,
  sourceSchema,
  syncResultSchema,
} from "@ffos/schemas";
import { getDb } from "../db/client";
import { households } from "../db/schema";
import { dataSources } from "../db/schema-economic";
import type { HouseholdAccessService } from "../households/household-access.service";
import { ObjectStorageService } from "../storage/object-storage.service";
import { IntakeService } from "./intake.service";

test("createSourceSchema defaults connection status", () => {
  const parsed = createSourceSchema.parse({
    householdId: "11111111-1111-4111-8111-111111111111",
    providerId: "mock-manual-csv",
  });
  assert.equal(parsed.connectionStatus, "CONNECTED");
});

test("source CRUD reconnect sync and import history", async () => {
  if (!process.env.DATABASE_URL) return;

  const db = getDb();
  const [household] = await db.select().from(households).limit(1);
  if (!household) return;

  const access = {
    requireMembership: async () => ({
      household,
      member: { id: "member", role: "OWNER" },
    }),
    requireCanWrite: async () => ({
      household,
      member: { id: "member", role: "OWNER" },
    }),
    requireAdmin: async () => ({
      household,
      member: { id: "member", role: "OWNER" },
    }),
    accountVisibility: async () => "full" as const,
    projectAccountListItem: <T>(item: T) => item,
    projectTransactionItem: <T>(item: T) => item,
  } as unknown as HouseholdAccessService;

  const service = new IntakeService(access, new ObjectStorageService());

  const created = sourceSchema.parse(
    await service.createSource("user-1", {
      householdId: household.id,
      providerId: "mock-manual-csv",
      name: "WS-K CSV",
      connectionStatus: "AUTH_REQUIRED",
    }),
  );
  assert.equal(created.providerId, "mock-manual-csv");
  assert.equal(created.connectionStatus, "AUTH_REQUIRED");
  assert.equal(created.freshnessLabel, "omautentisering krävs");

  const sync = syncResultSchema.parse(
    await service.reconnectSource("user-1", created.id, {
      householdId: household.id,
    }),
  );
  assert.equal(sync.ok, true);
  assert.ok(sync.importBatchId);

  const list = integrationsResponseSchema.parse(
    await service.integrations("user-1", household.id),
  );
  const row = list.sources.find((s) => s.id === created.id);
  assert.ok(row);
  assert.equal(row.connectionStatus, "CONNECTED");
  assert.ok(row.freshnessLabel);

  const imports = importsResponseSchema.parse(
    await service.imports("user-1", household.id),
  );
  assert.ok(imports.batches.some((b) => b.id === sync.importBatchId));
  assert.ok(
    imports.batches.some(
      (b) => b.sourceName === "WS-K CSV" || b.sourceId === created.id,
    ),
  );

  const archived = sourceSchema.parse(
    await service.archiveSource("user-1", household.id, created.id),
  );
  assert.equal(archived.connectionStatus, "DISCONNECTED");
  assert.ok(archived.archivedAt);

  const after = integrationsResponseSchema.parse(
    await service.integrations("user-1", household.id),
  );
  assert.ok(!after.sources.some((s) => s.id === created.id));

  // cleanup leftover row noise for local re-runs
  await db.delete(dataSources).where(eq(dataSources.id, created.id));
});
