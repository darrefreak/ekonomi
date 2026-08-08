import assert from "node:assert/strict";
import { requireTestDatabase } from "../testing/require-test-database";
import { requireDemoVehicle } from "../testing/demo-fixture";
import { test } from "node:test";
import {
  documentDetailSchema,
  documentsResponseSchema,
  uploadDocumentSchema,
} from "@ffos/schemas";
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
  requireTestDatabase();
  process.env.FFOS_STORAGE_DRIVER = "local";

  const { household, vehicle } = await requireDemoVehicle();

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
