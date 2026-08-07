import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import {
  documentDetailSchema,
  documentsResponseSchema,
  uploadDocumentSchema,
} from "@ffos/schemas";
import { getDb } from "../db/client";
import { households } from "../db/schema";
import { vehicles } from "../db/schema-vehicles";
import type { HouseholdAccessService } from "../households/household-access.service";
import { ObjectStorageService } from "../storage/object-storage.service";
import { IntakeService } from "./intake.service";

test("uploadDocumentSchema requires household and content", () => {
  const parsed = uploadDocumentSchema.parse({
    householdId: "11111111-1111-4111-8111-111111111111",
    title: "Test",
    filename: "t.pdf",
    contentBase64: Buffer.from("hello").toString("base64"),
  });
  assert.equal(parsed.documentType, "OTHER");
});

test("document upload storage extract status and vehicle link", async () => {
  if (!process.env.DATABASE_URL) return;
  process.env.FFOS_STORAGE_DRIVER = "local";

  const db = getDb();
  const [vehicle] = await db.select().from(vehicles).limit(1);
  if (!vehicle) return;
  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.id, vehicle.householdId))
    .limit(1);
  if (!household) return;

  const access = {
    requireMembership: async () => ({
      household,
      member: { id: "member", role: "OWNER" },
    }),
  } as unknown as HouseholdAccessService;

  const service = new IntakeService(access, new ObjectStorageService());
  const uploaded = documentDetailSchema.parse(
    await service.uploadDocument("user-1", {
      householdId: household.id,
      title: "Vattenfall el 1250.00",
      documentType: "INVOICE",
      filename: "vattenfall-test.pdf",
      contentType: "application/pdf",
      contentBase64: Buffer.from("%PDF-mock-content").toString("base64"),
      vehicleId: vehicle.id,
    }),
  );

  assert.ok(uploaded.storageKey);
  assert.ok(uploaded.extracted?.mock === true);
  assert.ok(["REVIEW", "ACTION_REQUIRED"].includes(uploaded.status));
  assert.equal(uploaded.vehicleId, vehicle.id);

  const archived = documentDetailSchema.parse(
    await service.updateDocument("user-1", uploaded.id, {
      householdId: household.id,
      status: "ARCHIVED",
    }),
  );
  assert.equal(archived.status, "ARCHIVED");

  const list = documentsResponseSchema.parse(
    await service.documents("user-1", household.id),
  );
  assert.ok(list.items.some((i) => i.id === uploaded.id));
});
